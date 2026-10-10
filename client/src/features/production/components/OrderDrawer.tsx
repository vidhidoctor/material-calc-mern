import type { OrderLineDto } from '@app/shared';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { Drawer } from '../../../components/Drawer';
import { QueryState } from '../../../components/ui';
import { formatDate, formatNumber } from '../../../lib/format';
import { useOrder } from '../production.hooks';
import { OrderStatusBadge, orderQuantityText } from './OrderStatusBadge';

function groupLines(lines: OrderLineDto[]): [string, OrderLineDto[]][] {
  const groups = new Map<string, OrderLineDto[]>();
  for (const line of lines) groups.set(line.component, [...(groups.get(line.component) ?? []), line]);
  return [...groups];
}

/** Compact order details in a side drawer; "View full details" opens the order page. */
export function OrderDrawer({ orderNo, onClose }: { orderNo: number; onClose: () => void }) {
  const order = useOrder(orderNo);

  return (
    <Drawer
      open
      title={`Order #${orderNo}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <Link className="btn btn-primary" to={`/orders/${orderNo}`}>
            View full details
          </Link>
        </>
      }
    >
      <QueryState query={order}>
        {(o) => (
          <div className="stack">
            <dl className="facts">
              <div>
                <dt>Status</dt>
                <dd>
                  <OrderStatusBadge status={o.status} />
                </dd>
              </div>
              <div>
                <dt>Party</dt>
                <dd>{o.party}</dd>
              </div>
              <div>
                <dt>Order date</dt>
                <dd>{formatDate(o.orderDate)}</dd>
              </div>
              <div>
                <dt>Order Quantity</dt>
                <dd>{orderQuantityText(o.quantity)}</dd>
              </div>
              <div>
                <dt>Total pieces</dt>
                <dd>{formatNumber(o.totalPieces, 0)}</dd>
              </div>
            </dl>

            <div>
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
            </div>
          </div>
        )}
      </QueryState>
    </Drawer>
  );
}
