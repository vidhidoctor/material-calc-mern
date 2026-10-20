import type { OrderDto, OrderSummaryDto } from '@app/shared';
import { Fragment } from 'react';
import { Icon } from '../../../components/Icon';
import { formatNumber } from '../../../lib/format';
import { CordPanel } from './CordPanel';
import { byLength, columnLabel, columnTitle, downloadPurchaseCsv, rowUnit, rowValue, totalToBuy } from '../purchase-sheet';

const empty = <span className="muted">—</span>;

/**
 * Purchase requirement, like the handwritten purchase order: sizes down the side, one column per material
 * in its purchase unit (sequences CD, beads KG, cord MTR → KG), and the total to buy for the whole order
 * at the bottom of each column. Each component (KALI, BLOUSE …) is named above its sizes; with several
 * components each also gets a subtotal.
 */
export function PurchaseSummary({ summary, order }: { summary: OrderSummaryDto; order: OrderDto }) {
  const columns = summary.columns;
  const components = summary.components;
  const multiple = components.length > 1;

  return (
    <div className="po-card">
      <div className="po-card-head">
        <span className="po-card-icon">
          <Icon name="cart" size={22} />
        </span>
        <div>
          <h3>Purchase Requirement Summary</h3>
          <p className="muted small">Each size × its order quantity, in the unit purchase buys (Material Master → Categories).</p>
        </div>
        <a className="btn btn-sm po-export" href={`/orders/${order.orderNo}/purchase-order`} target="_blank" rel="noreferrer">
          Print purchase order
        </a>
        <button type="button" className="btn btn-sm" onClick={() => downloadPurchaseCsv(summary, order)}>
          <Icon name="download" size={16} /> Export
        </button>
      </div>

      {summary.errors.length > 0 && (
        <div className="alert alert-error">
          <ul>
            {summary.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {columns.length === 0 ? (
        <p className="muted small">No material needed.</p>
      ) : (
        <div className="table-wrap po-table-wrap">
          <table className="po-table">
            <thead>
              <tr>
                <th className="po-size">Size</th>
                {columns.map((m) => (
                  <th key={m.key} title={m.error ?? undefined}>
                    <span className="po-material">{columnTitle(m)}</span>
                    {columnLabel(m, order.types, columns) && <span className="po-variant">{columnLabel(m, order.types, columns)}</span>}
                    <span className={`unit-pill ${!m.orderUnit ? 'unit-missing' : m.wholeUnits ? 'unit-count' : 'unit-weight'}`}>{rowUnit(m)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {components.map((component) => (
                <Fragment key={component.component}>
                  <tr className="po-component">
                    <td colSpan={columns.length + 1}>{component.component}</td>
                  </tr>
                  {summary.rows
                    .filter((row) => row.component === component.component)
                    .map((row) => (
                      <tr key={`${row.component}\u0000${row.size}`}>
                        <td className="po-size">{row.size}</td>
                        {columns.map((m) => (
                          <td key={m.key}>{rowValue(m, row.purchase, row.requirements) ?? empty}</td>
                        ))}
                      </tr>
                    ))}
                  {multiple && (
                    <tr className="po-subtotal">
                      <td className="po-size">{component.component} total</td>
                      {columns.map((m) => (
                        <td key={m.key}>{rowValue(m, component.purchase, component.requirements) ?? empty}</td>
                      ))}
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="po-size">Total</td>
                {columns.map((m) => {
                  const buy = totalToBuy(m, summary);
                  const exact = summary.purchaseTotals[m.key];
                  return (
                    <td key={m.key}>
                      {buy ? (
                        <>
                          {byLength(m) && (
                            <span className="po-length">
                              {formatNumber(summary.totals[m.key])} {m.unit} ↓
                            </span>
                          )}
                          <span className="po-total">
                            {buy} <span className={m.wholeUnits ? 'unit-count-text' : 'unit-weight-text'}>{m.orderUnit}</span>
                          </span>
                          {m.wholeUnits && exact !== summary.buy[m.key] && <span className="po-exact">needs {formatNumber(exact, 2)}</span>}
                        </>
                      ) : (
                        <span className="po-total text-danger" title={m.error}>
                          {formatNumber(summary.totals[m.key])} {m.unit}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <CordPanel summary={summary} types={order.types} orderLabel={`${order.party}-${order.partyOrderNo}`} />

      <div className="po-note">
        <Icon name="info" size={20} />
        <div>
          <strong>Total quantity shows the purchase requirement for the complete order (all sizes).</strong>
          <span className="muted small">
            Calculated using current Punching values and Material Master conversion rates; whole-unit materials (e.g. CD) are rounded up.
          </span>
        </div>
      </div>
    </div>
  );
}
