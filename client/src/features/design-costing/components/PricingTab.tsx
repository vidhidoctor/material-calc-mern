import type { DesignCostingAmountsDto, DesignCostingCalculationDto } from '@app/shared';
import { Fragment } from 'react';
import { Field, NumberInput } from '../../../components/ui';
import { formatRupees } from '../../../lib/format';
import { NO_RATE, rowKey, type Draft, type RateDraft } from '../costing-draft';

function PriceCells({ amounts }: { amounts: DesignCostingAmountsDto }) {
  return (
    <>
      <td className="align-right">{formatRupees(amounts.base)}</td>
      <td className="align-right">{formatRupees(amounts.markup)}</td>
      <td className="align-right costing-strong">{formatRupees(amounts.finalPrice)}</td>
    </>
  );
}

interface Props {
  designNo: string;
  /** Unsaved entries: the price list prints what is saved. */
  dirty: boolean;
  calculation: DesignCostingCalculationDto;
  draft: Draft;
  canManage: boolean;
  setMarkup: (value: string) => void;
  setRate: (key: string, field: keyof RateDraft, value: string) => void;
}

/** Markup and final price per piece, with the Remarks printed on the price list. */
export function PricingTab({ designNo, dirty, calculation, draft, canManage, setMarkup, setRate }: Props) {
  return (
    <section className="card costing-panel costing-tab">
      <div className="costing-tab-head">
        <div>
          <h2>Pricing Summary</h2>
          <p className="muted small">Final price = base cost + markup. Only the final price and Remarks are printed on the price list, exactly as typed.</p>
        </div>
        {dirty ? (
          <button type="button" className="btn btn-sm" disabled title="Save the costing first: the price list prints what is saved.">
            Print price list
          </button>
        ) : (
          <a className="btn btn-sm" href={`/design-costing/${encodeURIComponent(designNo)}/price-list`} target="_blank" rel="noreferrer">
            Print price list
          </a>
        )}
        <div className="costing-percents">
          <Field label="Markup %">
            <NumberInput decimal disabled={!canManage} value={draft.markup} onChange={setMarkup} />
          </Field>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table costing-table">
          <thead>
            <tr>
              <th>Per piece</th>
              <th className="align-right">Base cost</th>
              <th className="align-right">Markup</th>
              <th className="align-right">Final price</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {calculation.components.map((component) => (
              <Fragment key={component.name}>
                {component.sizes.map((s) => {
                  const key = rowKey(component.name, s.size);
                  return (
                    <tr key={s.size}>
                      <td>
                        {component.name} <strong>{s.size}</strong>
                      </td>
                      <PriceCells amounts={s} />
                      <td>
                        <input
                          className="input input-sm costing-note-input"
                          aria-label={`${component.name} ${s.size} remarks`}
                          maxLength={200}
                          disabled={!canManage}
                          value={(draft.rates[key] ?? NO_RATE).note}
                          onChange={(e) => setRate(key, 'note', e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
                <tr className="costing-subtotal">
                  <td>{component.name} total (1 piece of each size)</td>
                  <PriceCells amounts={component.total} />
                  <td />
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>All components</td>
              <PriceCells amounts={calculation.total} />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
