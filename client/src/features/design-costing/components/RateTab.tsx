import { DEFAULT_COSTING_HEADS, type DesignCostingCalculationDto } from '@app/shared';
import { Field, NumberInput } from '../../../components/ui';
import { formatRupees, formatNumber } from '../../../lib/format';
import { NO_RATE, rowKey, type Draft, type RateDraft } from '../costing-draft';

interface Props {
  designNo: string;
  /** Unsaved entries: the sheets print what is saved. */
  dirty: boolean;
  calculation: DesignCostingCalculationDto;
  draft: Draft;
  canManage: boolean;
  setRate: (key: string, field: keyof RateDraft, value: string) => void;
  setDiscount: (value: string) => void;
  onBulk: () => void;
}

/** A print link, or a disabled button while there are unsaved entries (the sheets print what is saved). */
function PrintLink({ dirty, href, children }: { dirty: boolean; href: string; children: string }) {
  return dirty ? (
    <button type="button" className="btn btn-sm" disabled title="Save the costing first: the sheet prints what is saved.">
      {children}
    </button>
  ) : (
    <a className="btn btn-sm" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** Stitch and laser rates per component and size, the cost of one piece, its markup and final price, and the Remarks. */
export function RateTab({ designNo, dirty, calculation, draft, canManage, setRate, setDiscount, onBulk }: Props) {
  const base = `/design-costing/${encodeURIComponent(designNo)}`;
  return (
    <section className="card costing-panel costing-tab">
      <div className="costing-tab-head">
        <div>
          <h2>Rate &amp; Pricing</h2>
          <p className="muted small">
            Per piece. Stitch cost = stitches ÷ 1000 × stitch rate × stitch heads; laser cost the same. Base cost = stitch + laser + material. Final price = base cost ÷ (1 − discount %), so after the discount you receive the base cost; markup = final price − base cost.
          </p>
        </div>
        <div className="row-actions">
          <PrintLink dirty={dirty} href={`${base}/rate-sheet`}>
            Print
          </PrintLink>
          <PrintLink dirty={dirty} href={`${base}/price-list`}>
            Print price list
          </PrintLink>
          {canManage && (
            <button type="button" className="btn btn-sm" onClick={onBulk}>
              Bulk update
            </button>
          )}
        </div>
        <div className="costing-percents">
          <Field label="Discount %" hint={`Markup needed: ${formatNumber(calculation.markupPercent)}%`}>
            <NumberInput decimal disabled={!canManage} value={draft.discount} onChange={setDiscount} />
          </Field>
        </div>
      </div>
      <div className="order-components">
        {calculation.components.map((component) => (
          <details key={component.name} className="order-component" open>
            <summary>
              <strong>{component.name}</strong>
              <span className="costing-component-total">
                1 pc of each size: base {formatRupees(component.total.base)} · final {formatRupees(component.total.finalPrice)}
              </span>
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
                    <th className="align-right">Markup</th>
                    <th className="align-right">Final price</th>
                    <th>Remarks</th>
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
                        <td className="align-right">{formatRupees(s.markup)}</td>
                        <td className="align-right costing-strong">{formatRupees(s.finalPrice)}</td>
                        <td>
                          <input
                            className="input input-sm costing-note-input"
                            aria-label={`${label} remarks`}
                            maxLength={200}
                            disabled={!canManage}
                            value={rate.note}
                            onChange={(e) => setRate(key, 'note', e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total (1 pc of each size)</td>
                    <td className="align-right">{formatRupees(component.total.stitchCost)}</td>
                    <td colSpan={3} />
                    <td className="align-right">{formatRupees(component.total.laserCost)}</td>
                    <td className="align-right">{formatRupees(component.total.materialCost)}</td>
                    <td className="align-right">{formatRupees(component.total.base)}</td>
                    <td className="align-right">{formatRupees(component.total.markup)}</td>
                    <td className="align-right">{formatRupees(component.total.finalPrice)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
