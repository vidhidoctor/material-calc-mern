import { DEFAULT_COSTING_HEADS, type JobWorkAmountsDto, type JobWorkCostingDto, type JobWorkInputDto } from '@app/shared';
import { useEffect, useMemo, useState } from 'react';
import { StatCard } from '../../components/StatCard';
import { EmptyState, ErrorAlert, NumberInput, parseNumberInput, QueryState } from '../../components/ui';
import { formatDateTime, formatNumber, formatRupees } from '../../lib/format';
import { useDebounced } from '../../lib/use-debounced';
import { HistoryButton } from '../audit/components/HistoryPanel';
import { BulkRateModal, type BulkRates } from '../design-costing/components/BulkRateModal';
import { useJobWorkCosting, useJobWorkPreview, useSaveJobWorkCosting } from './job-work-costing.hooks';

const rowKey = (component: string, size: string) => `${component}\u0000${size}`;
const text = (value: number | null) => (value === null ? '' : String(value));

/** One row as typed. Blank Stitches / Laser = the Punching Master quantity. */
interface RowDraft {
  stitch: string;
  laser: string;
  stitchRate: string;
  laserRate: string;
  stitchHeads: string;
  laserHeads: string;
  rate: string;
}

interface Draft {
  rows: Record<string, RowDraft>;
  excluded: string[];
}

const HEADS = String(DEFAULT_COSTING_HEADS);
const NO_ROW: RowDraft = { stitch: '', laser: '', stitchRate: '', laserRate: '', stitchHeads: HEADS, laserHeads: HEADS, rate: '' };

const toDraft = (saved: JobWorkInputDto): Draft => ({
  rows: Object.fromEntries(
    saved.rows.map((r) => [
      rowKey(r.component, r.size),
      {
        stitch: text(r.stitch),
        laser: text(r.laser),
        stitchRate: text(r.stitchRate),
        laserRate: text(r.laserRate),
        stitchHeads: String(r.stitchHeads),
        laserHeads: String(r.laserHeads),
        rate: text(r.rate),
      },
    ]),
  ),
  excluded: saved.excluded,
});

function toBody(draft: Draft, data: JobWorkCostingDto): JobWorkInputDto {
  return {
    rows: data.calculation.components.flatMap((c) =>
      c.sizes.map((s) => {
        const row = draft.rows[rowKey(c.name, s.size)] ?? NO_ROW;
        return {
          component: c.name,
          size: s.size,
          stitch: parseNumberInput(row.stitch),
          laser: parseNumberInput(row.laser),
          stitchRate: parseNumberInput(row.stitchRate),
          laserRate: parseNumberInput(row.laserRate),
          // A cleared box counts as the default, as its placeholder shows.
          stitchHeads: parseNumberInput(row.stitchHeads) ?? DEFAULT_COSTING_HEADS,
          laserHeads: parseNumberInput(row.laserHeads) ?? DEFAULT_COSTING_HEADS,
          rate: parseNumberInput(row.rate),
        };
      }),
    ),
    excluded: draft.excluded,
  };
}

function AmountCells({ amounts }: { amounts: JobWorkAmountsDto }) {
  return (
    <>
      <td className="align-right">{formatRupees(amounts.includedMaterials)}</td>
      <td className="align-right muted">{formatRupees(amounts.excludedMaterials)}</td>
      <td className="align-right costing-strong">{formatRupees(amounts.finalCost)}</td>
    </>
  );
}

function Editor({ data, canManage }: { data: JobWorkCostingDto; canManage: boolean }) {
  const [draft, setDraft] = useState(() => toDraft(data.saved));
  const [dirty, setDirty] = useState(false);
  const [bulk, setBulk] = useState(false);
  const save = useSaveJobWorkCosting(data.designNo);

  // Fresh data (e.g. after a punching edit) replaces the entries only when none are unsaved.
  useEffect(() => {
    if (!dirty) setDraft(toDraft(data.saved));
  }, [data.saved, dirty]);

  const body = useMemo(() => toBody(draft, data), [draft, data]);
  const settledBody = useDebounced(body, 300);
  const preview = useJobWorkPreview(data.designNo, settledBody, dirty);
  const calculation = (dirty ? preview.data : null) ?? data.calculation;
  const recalculating = dirty && (preview.isFetching || settledBody !== body);

  const change = (update: (current: Draft) => Draft) => {
    setDirty(true);
    setDraft(update);
  };
  const setCell = (key: string, field: keyof RowDraft, value: string) =>
    change((d) => ({ ...d, rows: { ...d.rows, [key]: { ...(d.rows[key] ?? NO_ROW), [field]: value } } }));
  const setIncluded = (key: string, included: boolean) =>
    change((d) => ({ ...d, excluded: included ? d.excluded.filter((k) => k !== key) : [...d.excluded, key] }));

  const applyBulk = ({ component, stitch, laser, stitchHeads, laserHeads }: BulkRates) => {
    change((d) => {
      const rows = { ...d.rows };
      for (const c of data.calculation.components) {
        if (component && c.name !== component) continue;
        for (const s of c.sizes) {
          const key = rowKey(c.name, s.size);
          const current = rows[key] ?? NO_ROW;
          rows[key] = {
            ...current,
            stitchRate: stitch || current.stitchRate,
            laserRate: laser || current.laserRate,
            stitchHeads: stitchHeads || current.stitchHeads,
            laserHeads: laserHeads || current.laserHeads,
          };
        }
      }
      return { ...d, rows };
    });
    setBulk(false);
  };

  return (
    <div className="stack">
      <div className="costing-tab-head">
        <p className="muted small">
          What the job worker is paid per piece. Separate from Rate &amp; Costing: nothing here changes your own costing, prices, the Punching Master or Material Master rates.{' '}
          {data.savedAt && `Saved ${formatDateTime(data.savedAt)} by ${data.savedBy}.`}
        </p>
        <div className="row-actions">
          <HistoryButton type="JobWorkCosting" id={data.designNo} title={`Job work costing ${data.designNo}`} />
          {canManage && (
            <button type="button" className="btn btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(body, { onSuccess: () => setDirty(false) })}>
              {save.isPending ? 'Saving…' : dirty ? 'Save job work' : 'Saved'}
            </button>
          )}
        </div>
      </div>
      <ErrorAlert error={save.error ?? (dirty ? preview.error : null)} />
      {calculation.errors.length > 0 && (
        <details className="alert alert-info costing-pending">
          <summary>Pending inputs ({calculation.errors.length}): not in the figures yet</summary>
          <ul className="costing-notes">
            {calculation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      )}

      <div className={`stack ${recalculating ? 'is-stale' : ''}`}>
        <div className="order-stats">
          <StatCard icon="users" label="Job worker rate">
            <strong className="order-stat-value">{formatRupees(calculation.total.rate)}</strong>
          </StatCard>
          <StatCard icon="layers" label="Stitch cost">
            <strong className="order-stat-value">{formatRupees(calculation.total.stitchCost)}</strong>
          </StatCard>
          <StatCard icon="sliders" label="Laser cost">
            <strong className="order-stat-value">{formatRupees(calculation.total.laserCost)}</strong>
          </StatCard>
          <StatCard icon="package" label="Included materials">
            <strong className="order-stat-value">{formatRupees(calculation.total.includedMaterials)}</strong>
          </StatCard>
          <StatCard icon="rupee" label="Final job work cost">
            <strong className="order-stat-value">{formatRupees(calculation.total.finalCost)}</strong>
          </StatCard>
        </div>

        <section className="card">
          <header className="card-header">
            <div>
              <h2>Materials</h2>
              <span className="muted small">One piece of every size. Switch a material off when the job worker's rate already covers it.</span>
            </div>
          </header>
          {calculation.materials.length === 0 ? (
            <EmptyState title="No material entered in Punching yet." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="align-right">Quantity</th>
                    <th className="align-right">Cost</th>
                    <th>Include in job work cost</th>
                  </tr>
                </thead>
                <tbody>
                  {calculation.materials.map((m) => {
                    const included = !draft.excluded.includes(m.key);
                    return (
                      <tr key={m.key}>
                        <td>
                          <strong>{m.label}</strong>
                          {m.detail && <span className="muted small"> · {m.detail}</span>}
                        </td>
                        <td className="align-right">
                          {formatNumber(m.qty, 4)} {m.unit}
                        </td>
                        <td className="align-right">{m.cost === null ? <span className="muted">No rate</span> : formatRupees(m.cost)}</td>
                        <td>
                          <label className="checkbox-label">
                            <input type="checkbox" disabled={!canManage} checked={included} onChange={(e) => setIncluded(m.key, e.target.checked)} />
                            {included ? 'Included' : 'Excluded'}
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card costing-panel costing-tab">
          <div className="costing-tab-head">
            <div>
              <h2>Job Work Summary</h2>
              <p className="muted small">
                Final cost = job worker rate + stitch cost + laser cost + included materials. Stitch cost = stitches ÷ 1000 × rate × heads; laser cost the same. Stitches and Laser start from the Punching
                Master: type to change them here, clear the box to go back. Excluded materials are shown for reference only.
              </p>
            </div>
            {canManage && (
              <button type="button" className="btn btn-sm" onClick={() => setBulk(true)}>
                Bulk update
              </button>
            )}
          </div>
          <div className="order-components">
            {calculation.components.map((component) => (
              <details key={component.name} className="order-component" open>
                <summary>
                  <strong>{component.name}</strong>
                  <span className="costing-component-total">Final cost, 1 pc of each size: {formatRupees(component.total.finalCost)}</span>
                </summary>
                <div className="table-wrap">
                  <table className="table costing-table job-work-table">
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th className="align-right">Stitches</th>
                        <th className="align-right">Stitch rate</th>
                        <th className="align-right">Stitch heads</th>
                        <th className="align-right">Stitch cost</th>
                        <th className="align-right">Laser</th>
                        <th className="align-right">Laser rate</th>
                        <th className="align-right">Laser heads</th>
                        <th className="align-right">Laser cost</th>
                        <th className="align-right">Job worker rate</th>
                        <th className="align-right">Included materials</th>
                        <th className="align-right">Excluded materials</th>
                        <th className="align-right">Final cost / pc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {component.sizes.map((s) => {
                        const key = rowKey(component.name, s.size);
                        const row = draft.rows[key] ?? NO_ROW;
                        const label = `${component.name} ${s.size}`;
                        const input = (field: keyof RowDraft, name: string, placeholder: string, decimal = true, className = '') => (
                          <NumberInput
                            decimal={decimal}
                            className={`input-sm ${className}`}
                            aria-label={`${label} ${name}`}
                            placeholder={placeholder}
                            disabled={!canManage}
                            value={row[field]}
                            onChange={(v) => setCell(key, field, v)}
                          />
                        );
                        return (
                          <tr key={s.size}>
                            <td>
                              <strong>{s.size}</strong>
                            </td>
                            <td className="align-right">{input('stitch', 'stitches', String(s.punchingStitch), false, 'job-work-qty')}</td>
                            <td className="align-right">{input('stitchRate', 'stitch rate', '₹')}</td>
                            <td className="align-right">{input('stitchHeads', 'stitch heads', HEADS)}</td>
                            <td className="align-right">{formatRupees(s.stitchCost)}</td>
                            <td className="align-right">{input('laser', 'laser', String(s.punchingLaser ?? 0), false, 'job-work-qty')}</td>
                            <td className="align-right">{input('laserRate', 'laser rate', '₹')}</td>
                            <td className="align-right">{input('laserHeads', 'laser heads', HEADS)}</td>
                            <td className="align-right">{formatRupees(s.laserCost)}</td>
                            <td className="align-right">{input('rate', 'job worker rate', '₹')}</td>
                            <AmountCells amounts={s} />
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>{component.name} total (1 piece of each size)</td>
                        <td className="align-right">{formatRupees(component.total.stitchCost)}</td>
                        <td colSpan={3} />
                        <td className="align-right">{formatRupees(component.total.laserCost)}</td>
                        <td className="align-right">{formatRupees(component.total.rate)}</td>
                        <AmountCells amounts={component.total} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </details>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table costing-table">
              <thead>
                <tr>
                  <th>Overall</th>
                  <th className="align-right">Job worker rate</th>
                  <th className="align-right">Stitch cost</th>
                  <th className="align-right">Laser cost</th>
                  <th className="align-right">Included materials</th>
                  <th className="align-right">Excluded materials</th>
                  <th className="align-right">Final job work cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>All components</td>
                  <td className="align-right">{formatRupees(calculation.total.rate)}</td>
                  <td className="align-right">{formatRupees(calculation.total.stitchCost)}</td>
                  <td className="align-right">{formatRupees(calculation.total.laserCost)}</td>
                  <AmountCells amounts={calculation.total} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {bulk && <BulkRateModal components={calculation.components.map((c) => c.name)} onApply={applyBulk} onClose={() => setBulk(false)} />}
    </div>
  );
}

/** The Job Work Costing tab: its own rates, quantities, material choices and Save, independent of the design costing. */
export function JobWorkTab({ designNo, canManage }: { designNo: string; canManage: boolean }) {
  const query = useJobWorkCosting(designNo);
  return <QueryState query={query}>{(data) => <Editor key={data.designNo} data={data} canManage={canManage} />}</QueryState>;
}
