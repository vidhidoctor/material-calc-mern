import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderLineDto, type OrderStatus } from '@app/shared';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { Drawer } from '../../../components/Drawer';
import { ErrorAlert, QueryState } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate, formatNumber } from '../../../lib/format';
import { useOrder, useOrderSummary, useUpdateOrderStatus } from '../production.hooks';
import { OrderStatusBadge } from './OrderStatusBadge';
import { RequirementTable } from './RequirementTable';

function groupLines(lines: OrderLineDto[]): [string, OrderLineDto[]][] {
  const groups = new Map<string, OrderLineDto[]>();
  for (const line of lines) groups.set(line.component, [...(groups.get(line.component) ?? []), line]);
  return [...groups];
}

/** Everything about one order: stats, status, quantities and material requirement. */
export function OrderDrawer({ orderNo, onClose }: { orderNo: number; onClose: () => void }) {
  const auth = useAuth();
  const order = useOrder(orderNo);
  const summary = useOrderSummary(orderNo);
  const status = useUpdateOrderStatus(orderNo);

  return (
    <Drawer
      open
      title={
        <span className="drawer-title">
          <span>Order #{orderNo}</span>
          {order.data && <span className="badge badge-blue">{order.data.party}</span>}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          {auth.can('PURCHASE_REQUIREMENT_VIEW') && (
            <Link className="btn footer-note" to={`/purchase?orderNo=${orderNo}`}>
              Purchase requirement
            </Link>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <QueryState query={order}>
        {(o) => (
          <div className="stack">
            <div className="stat-row">
              <div className="stat">
                <span className="muted small">Total pieces</span>
                <strong>{formatNumber(o.totalPieces, 0)}</strong>
              </div>
              <div className="stat">
                <span className="muted small">Order date</span>
                <strong>{formatDate(o.orderDate)}</strong>
              </div>
            </div>

            <div className="drawer-status">
              <span className="muted small">Status</span>
              {auth.can('PRODUCTION_UPDATE') ? (
                <select
                  className="input"
                  aria-label="Order status"
                  value={o.status}
                  disabled={status.isPending}
                  onChange={(e) => status.mutate(e.target.value as OrderStatus)}
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <OrderStatusBadge status={o.status} />
              )}
            </div>
            <ErrorAlert error={status.error} />

            <section>
              <h3 className="drawer-subtitle">Component-wise quantity</h3>
              <div className="table-wrap bordered">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Size</th>
                      <th className="align-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupLines(o.lines).map(([component, lines]) => (
                      <Fragment key={component}>
                        {lines.map((line, i) => (
                          <tr key={line.size}>
                            {i === 0 && (
                              <td rowSpan={lines.length} className="cell-group">
                                <strong>{component}</strong>
                              </td>
                            )}
                            <td>{line.size}</td>
                            <td className="align-right">{formatNumber(line.quantity, 0)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td className="align-right">{formatNumber(o.totalPieces, 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section>
              <h3 className="drawer-subtitle">Material requirement</h3>
              <p className="muted small drawer-note">Consumption per piece × quantity, from the design's current Punching values.</p>
              <QueryState query={summary}>
                {(s) => (
                  <div className="bordered rounded">
                    {s.errors.length > 0 && (
                      <div className="alert alert-error section-alert">
                        <ul>
                          {s.errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <RequirementTable summary={s} totalPieces={o.totalPieces} />
                  </div>
                )}
              </QueryState>
            </section>
          </div>
        )}
      </QueryState>
    </Drawer>
  );
}
