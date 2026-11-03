import type { JobWorkAmountsDto } from '@app/shared';
import { useState } from 'react';
import { EmptyState, NumberInput } from '../../components/ui';
import { formatNumber, formatRupees } from '../../lib/format';
import { BulkRateModal } from '../design-costing/components/BulkRateModal';
import { HEADS, NO_ROW, rowKey, type JobWorkEditor, type RowDraft } from './use-job-work-editor';

function AmountCells({ amounts }: { amounts: JobWorkAmountsDto }) {
  return (
    <>
      <td className="align-right">{formatRupees(amounts.includedMaterials)}</td>
      <td className="align-right muted">{formatRupees(amounts.excludedMaterials)}</td>
      <td className="align-right costing-strong">{formatRupees(amounts.finalCost)}</td>
    </>
  );
}

/** What is below the tabs for job work: its materials and summary. The header, cards and Save are the page's. */
export function JobWorkTab({ editor, canManage }: { editor: JobWorkEditor; canManage: boolean }) {
  const { calculation, draft, setCell, setIncluded, applyBulk } = editor;
  const [bulk, setBulk] = useState(false);

  return (
    <div className="stack">
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
      </section>
      {bulk && (
        <BulkRateModal
          components={calculation.components.map((c) => c.name)}
          onApply={(rates) => {
            applyBulk(rates);
            setBulk(false);
          }}
          onClose={() => setBulk(false)}
        />
      )}
    </div>
  );
}
