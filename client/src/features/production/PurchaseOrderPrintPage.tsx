import { APP_NAME, PURCHASE_ORDER_COPIES, type PurchaseOrderDto, type PurchaseOrderSectionDto } from '@app/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PrintHeader } from '../../components/PrintHeader';
import { ErrorAlert, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatNumber } from '../../lib/format';
import { usePurchaseOrder, useSavePurchaseOrderNames } from './production.hooks';

type Names = Record<string, string>;

function SectionTable({ section, index, names, onName }: { section: PurchaseOrderSectionDto; index: number; names: Names; onName: (id: string, name: string) => void }) {
  return (
    <section className="po-section">
      <h3 className="po-section-tab">
        {index + 1}. {section.title}
      </h3>
      <table className="po-slip-table">
        <colgroup>
          <col className="po-col-item" />
          <col className="po-col-qty" />
          <col className="po-col-name" />
          <col className="po-col-sample" />
        </colgroup>
        <thead>
          <tr>
            <th>{section.itemHeader}</th>
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

/** Material Requirements: whole-order totals per material + colour (+ type), below the sheet. */
function RequirementsTable({ totals }: { totals: PurchaseOrderDto['totals'] }) {
  if (totals.length === 0) return null;
  return (
    <section className="po-section po-requirements">
      <h3 className="po-section-tab">Material Requirements</h3>
      <table className="po-slip-table">
        <colgroup>
          <col className="po-col-item" />
          <col className="po-col-total" />
          <col className="po-col-buy" />
          <col className="po-col-sample" />
        </colgroup>
        <thead>
          <tr>
            <th>Material</th>
            <th>Total Required</th>
            <th>To Buy</th>
            <th>Sample</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.key}>
              <td>
                <span className="po-item">{t.label}</span>
                {t.detail && <span className="po-item-detail">{t.detail}</span>}
              </td>
              <td>
                {formatNumber(t.totalQty, 2)} <span className="po-unit">{t.totalUnit}</span>
              </td>
              <td className="po-qty">
                {t.qty === null ? (
                  '—'
                ) : (
                  <>
                    {formatNumber(t.qty, 3)} <span className="po-unit">{t.unit}</span>
                  </>
                )}
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

interface SlipProps {
  data: PurchaseOrderDto;
  /** Department this copy is for (PURCHASE_ORDER_COPIES). */
  department: string;
  names: Names;
  onName: (id: string, name: string) => void;
}

function Slip({ data, department, names, onName }: SlipProps) {
  return (
    <article className="po-slip">
      <PrintHeader title="PURCHASE ORDER" department={department} date={data.orderDate}>
        <p className="po-order-ref">
          D.N. <strong>{data.designNo}</strong> · {data.item} · Party <strong>{data.party}</strong> · Order <strong>#{data.partyOrderNo}</strong>
        </p>
        {data.color && (
          <p className="po-order-ref">
            Color: <strong>{data.color}</strong>
          </p>
        )}
      </PrintHeader>
      {data.sections.map((section, i) => (
        <SectionTable key={section.id} section={section} index={i} names={names} onName={onName} />
      ))}
      {data.sections.length === 0 && <p className="po-empty">No material needed for this order.</p>}
      <RequirementsTable totals={data.totals} />
    </article>
  );
}

/**
 * Printable purchase order: one copy per department (PURCHASE_ORDER_COPIES), each starting on a new
 * A4 page and never cut off. Quantities come from the order calculation; only the Name of each row is
 * typed here (saved on the order, printed exactly as entered). The screen shows the first copy.
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

  useEffect(() => {
    if (query.data) document.title = `PO ${query.data.designNo} ${query.data.party}-${query.data.partyOrderNo}`;
    return () => {
      document.title = APP_NAME;
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
          Type the names, then print. Prints {PURCHASE_ORDER_COPIES.length} copies, one per page:{' '}
          {PURCHASE_ORDER_COPIES.map((d) => d.replace(/ DEPARTMENT$/, '').toLowerCase()).join(', ')}.
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
            {PURCHASE_ORDER_COPIES.map((department, i) => (
              <div key={department} className={i === 0 ? 'po-page' : 'po-page po-page-break po-copy-extra'}>
                <Slip data={data} department={department} names={names} onName={onName} />
              </div>
            ))}
          </>
        )}
      </QueryState>
    </div>
  );
}
