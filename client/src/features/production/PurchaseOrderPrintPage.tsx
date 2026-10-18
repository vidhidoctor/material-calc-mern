import { COMPANY_NAME, type PurchaseOrderDto, type PurchaseOrderSectionDto } from '@app/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorAlert, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNumber } from '../../lib/format';
import { usePurchaseOrder, useSavePurchaseOrderNames } from './production.hooks';

/** A4 portrait with 8 mm margins: printable 194 × 281 mm. Two slips fit when one is at most half of it. */
const MM = 96 / 25.4;
const PRINTABLE_HEIGHT_MM = 281;
const CUT_LINE_MM = 8;
const HALF_PAGE_PX = ((PRINTABLE_HEIGHT_MM - CUT_LINE_MM) / 2) * MM;

type Names = Record<string, string>;

function Ornament() {
  return (
    <svg className="po-ornament" viewBox="0 0 80 64" aria-hidden="true">
      <path d="M6 60 C24 44 40 30 74 6" />
      {[
        [18, 50, -40],
        [28, 42, 30],
        [36, 35, -45],
        [46, 27, 25],
        [54, 21, -50],
        [63, 14, 20],
        [70, 9, -30],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="7" ry="2.6" transform={`rotate(${r} ${x} ${y}) translate(${i % 2 ? 5 : -5} ${i % 2 ? -4 : 4})`} />
      ))}
    </svg>
  );
}

function SectionTable({ section, index, names, onName }: { section: PurchaseOrderSectionDto; index: number; names: Names; onName: (id: string, name: string) => void }) {
  return (
    <section className="po-section">
      <h3 className="po-section-tab">
        {index + 1}. {section.title}
      </h3>
      <table className="po-slip-table">
        <colgroup>
          <col className="po-col-item" />
          <col className="po-col-total" />
          <col className="po-col-qty" />
          <col className="po-col-name" />
          <col className="po-col-sample" />
        </colgroup>
        <thead>
          <tr>
            <th>{section.itemHeader}</th>
            <th>Total Qty</th>
            <th>Series in VC{section.unit ? ` (${section.unit})` : ''}</th>
            <th>Name</th>
            <th>Sample</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="po-item">{row.label}</span>
                {row.detail && <span className="po-item-detail">{row.detail}</span>}
              </td>
              <td>
                {formatNumber(row.totalQty, 2)} <span className="po-unit">{row.totalUnit}</span>
              </td>
              <td className="po-qty">
                {row.qty === null ? (
                  '—'
                ) : (
                  <>
                    {formatNumber(row.qty, 3)}
                    {!section.unit && row.unit && <span className="po-unit"> {row.unit}</span>}
                  </>
                )}
              </td>
              <td className="po-name-cell">
                <input
                  className="po-name-input"
                  aria-label={`Name for ${section.title} ${row.label}`}
                  maxLength={100}
                  value={names[row.id] ?? ''}
                  onChange={(e) => onName(row.id, e.target.value)}
                />
                <span className="po-name-print">{names[row.id] ?? ''}</span>
              </td>
              <td>
                <span className="po-sample-box" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Slip({ data, names, onName }: { data: PurchaseOrderDto; names: Names; onName: (id: string, name: string) => void }) {
  return (
    <article className="po-slip">
      <header className="po-slip-head">
        <Ornament />
        <div className="po-slip-title">
          <h1 className="po-company">{COMPANY_NAME}</h1>
          <p className="po-doc-title">
            <span>PURCHASE ORDER</span>
          </p>
          <p className="po-order-ref">
            D.N. <strong>{data.designNo}</strong> · {data.item} · Party <strong>{data.party}</strong> · Order <strong>#{data.partyOrderNo}</strong>
          </p>
        </div>
        <div className="po-date">
          DATE : <strong>{formatDate(data.orderDate)}</strong>
        </div>
      </header>
      {data.sections.map((section, i) => (
        <SectionTable key={section.id} section={section} index={i} names={names} onName={onName} />
      ))}
      {data.sections.length === 0 && <p className="po-empty">No material needed for this order.</p>}
    </article>
  );
}

/**
 * Printable purchase order: two slips per A4 page (cut line between) when one slip fits in half a page,
 * otherwise each slip on its own page(s), never cut off. Quantities come from the order calculation;
 * only the Name of each row is typed here (saved on the order, printed exactly as entered).
 */
export function PurchaseOrderPrintPage() {
  const orderNo = Number(useParams().orderNo);
  const auth = useAuth();
  const query = usePurchaseOrder(orderNo);
  const save = useSavePurchaseOrderNames(orderNo);
  const canSave = auth.can('PRODUCTION_UPDATE') || auth.can('PURCHASE_REQUIREMENT_VIEW');

  const savedNames = useMemo<Names>(
    () => Object.fromEntries((query.data?.sections ?? []).flatMap((s) => s.rows.map((r) => [r.id, r.name]))),
    [query.data],
  );
  const [names, setNames] = useState<Names>({});
  useEffect(() => setNames(savedNames), [savedNames]);
  const changed = Object.fromEntries(Object.entries(names).filter(([id, name]) => (savedNames[id] ?? '') !== name));
  const dirty = Object.keys(changed).length > 0;
  const onName = (id: string, name: string) => setNames((n) => ({ ...n, [id]: name }));

  // Two slips per page only when one slip is at most half the printable height (measured at print width).
  const measureRef = useRef<HTMLDivElement>(null);
  const [twoUp, setTwoUp] = useState(true);
  useLayoutEffect(() => {
    const height = measureRef.current?.offsetHeight ?? 0;
    setTwoUp(height > 0 && height <= HALF_PAGE_PX);
  }, [query.data]);

  useEffect(() => {
    if (query.data) document.title = `PO ${query.data.designNo} ${query.data.party}-${query.data.partyOrderNo}`;
    return () => {
      document.title = 'Material Calc';
    };
  }, [query.data]);

  const print = () => {
    if (dirty && canSave) save.mutate(changed, { onSuccess: () => setTimeout(() => window.print(), 50) });
    else window.print();
  };

  return (
    <div className="po-print">
      <div className="po-toolbar no-print">
        <Link to="/orders" className="btn btn-ghost">
          ← Order Master
        </Link>
        <span className="muted small po-toolbar-note">
          Type the names, then print. {twoUp ? 'Two slips on one A4 page.' : 'One slip per page (too long for half a page).'}
        </span>
        {canSave && (
          <button type="button" className="btn" disabled={!dirty || save.isPending} onClick={() => save.mutate(changed)}>
            {save.isPending ? 'Saving…' : dirty ? 'Save names' : 'Saved'}
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={!query.data || save.isPending} onClick={print}>
          Print
        </button>
      </div>
      <div className="no-print po-toolbar-error">
        <ErrorAlert error={save.error} />
      </div>

      <QueryState query={query}>
        {(data) => (
          <>
            {/* Invisible copy at print width, to measure one slip. */}
            <div className="po-measure" aria-hidden="true" inert>
              <div ref={measureRef}>
                <Slip data={data} names={names} onName={() => undefined} />
              </div>
            </div>
            {twoUp ? (
              <div className="po-page po-two-up">
                <Slip data={data} names={names} onName={onName} />
                <div className="po-cut" aria-hidden="true">
                  <span>✂</span>
                </div>
                <Slip data={data} names={names} onName={onName} />
              </div>
            ) : (
              <>
                <div className="po-page">
                  <Slip data={data} names={names} onName={onName} />
                </div>
                <div className="po-page po-page-break">
                  <Slip data={data} names={names} onName={onName} />
                </div>
              </>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
