import { DEFAULT_COSTING_HEADS, type DesignCostingCalculationDto } from '@app/shared';
import { NumberInput } from '../../../components/ui';
import { formatRupees, formatNumber } from '../../../lib/format';
import { NO_RATE, rowKey, type Draft, type RateDraft } from '../costing-draft';

interface Props {
  designNo: string;
  /** Unsaved entries: the sheet prints what is saved. */
  dirty: boolean;
  calculation: DesignCostingCalculationDto;
  draft: Draft;
  canManage: boolean;
  setRate: (key: string, field: keyof RateDraft, value: string) => void;
  onBulk: () => void;
}

/** Stitch and laser rates per component and size, with the cost of one piece. */
export function RateTab({ designNo, dirty, calculation, draft, canManage, setRate, onBulk }: Props) {
  return (
    <section className="card costing-panel costing-tab">
      <div className="costing-tab-head">
        <div>
          <h2>Rate &amp; Costing</h2>
          <p className="muted small">Cost per piece. Stitch cost = stitches ÷ 1000 × stitch rate × stitch heads; laser cost = laser ÷ 1000 × laser rate × laser heads.</p>
        </div>
        <div className="row-actions">
          {dirty ? (
            <button type="button" className="btn btn-sm" disabled title="Save the costing first: the sheet prints what is saved.">
              Print
            </button>
          ) : (
            <a className="btn btn-sm" href={`/design-costing/${encodeURIComponent(designNo)}/rate-sheet`} target="_blank" rel="noreferrer">
              Print
            </a>
          )}
          {canManage && (
            <button type="button" className="btn btn-sm" onClick={onBulk}>
              Bulk update
            </button>
          )}
        </div>
      </div>
      <div className="order-components">
        {calculation.components.map((component) => (
          <details key={component.name} className="order-component" open>
            <summary>
              <strong>{component.name}</strong>
              <span className="costing-component-total">Base cost, 1 pc of each size: {formatRupees(component.total.base)}</span>
            </summary>
            <div className="table-wrap">
              <table className="table costing-table">
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
                    <th className="align-right">Material cost</th>
                    <th className="align-right">Base cost</th>
                  </tr>
                </thead>
                <tbody>
                  {component.sizes.map((s) => {
                    const key = rowKey(component.name, s.size);
                    const rate = draft.rates[key] ?? NO_RATE;
                    const label = `${component.name} ${s.size}`;
                    return (
                      <tr key={s.size}>
                        <td>
                          <strong>{s.size}</strong>
                        </td>
                        <td className="align-right">{formatNumber(s.stitch, 0)}</td>
                        <td className="align-right">
                          <NumberInput decimal className="input-sm" aria-label={`${label} stitch rate`} placeholder="₹" disabled={!canManage} value={rate.stitch} onChange={(v) => setRate(key, 'stitch', v)} />
                        </td>
                        <td className="align-right">
                          <NumberInput decimal className="input-sm costing-heads-input" aria-label={`${label} stitch heads`} placeholder={String(DEFAULT_COSTING_HEADS)} disabled={!canManage} value={rate.stitchHeads} onChange={(v) => setRate(key, 'stitchHeads', v)} />
                        </td>
                        <td className="align-right">{formatRupees(s.stitchCost)}</td>
                        <td className="align-right">{s.laser === null ? <span className="muted">—</span> : formatNumber(s.laser, 0)}</td>
                        <td className="align-right">
                          <NumberInput decimal className="input-sm" aria-label={`${label} laser rate`} placeholder="₹" disabled={!canManage} value={rate.laser} onChange={(v) => setRate(key, 'laser', v)} />
                        </td>
                        <td className="align-right">
                          <NumberInput decimal className="input-sm costing-heads-input" aria-label={`${label} laser heads`} placeholder={String(DEFAULT_COSTING_HEADS)} disabled={!canManage} value={rate.laserHeads} onChange={(v) => setRate(key, 'laserHeads', v)} />
                        </td>
                        <td className="align-right">{formatRupees(s.laserCost)}</td>
                        <td className="align-right">{formatRupees(s.materialCost)}</td>
                        <td className="align-right costing-strong">{formatRupees(s.base)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
