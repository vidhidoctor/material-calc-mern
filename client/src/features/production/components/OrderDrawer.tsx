import { Link } from 'react-router';
import { Drawer } from '../../../components/Drawer';
import { ErrorAlert, QueryState } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate, formatNumber } from '../../../lib/format';
import { useDeleteOrder, useOrder, useOrderSummary } from '../production.hooks';
import { OrderLinesTable } from './OrderLinesTable';

/** Everything about one order: stats, quantities and material requirement. */
export function OrderDrawer({ orderNo, onClose }: { orderNo: number; onClose: () => void }) {
  const auth = useAuth();
  const order = useOrder(orderNo);
  const summary = useOrderSummary(orderNo);
  const remove = useDeleteOrder();

  const onDelete = () => {
    const label = order.data ? `${order.data.party}-${order.data.partyOrderNo}` : `this order`;
    if (window.confirm(`Delete order ${label}? It is removed from all lists and purchase requirements. This cannot be undone.`)) {
      remove.mutate(orderNo, { onSuccess: onClose });
    }
  };

  return (
    <Drawer
      open
      title={
        <span className="drawer-title">
          <span>Order {order.data ? `#${order.data.partyOrderNo}` : ''}</span>
          {order.data && <span className="badge badge-blue">{order.data.party}</span>}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          {auth.can('PRODUCTION_UPDATE') && (
            <button type="button" className="btn btn-danger-ghost" disabled={remove.isPending} onClick={onDelete}>
              Delete order
            </button>
          )}
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
            <ErrorAlert error={remove.error} />
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


            <section>
              <h3 className="drawer-subtitle">Quantities &amp; material requirement</h3>
              <p className="muted small drawer-note">Requirement = consumption per piece × quantity (current Punching values).</p>
              <QueryState query={summary}>
                {(s) => (
                  <>
                    {s.errors.length > 0 && (
                      <div className="alert alert-error">
                        <ul>
                          {s.errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <OrderLinesTable summary={s} totalPieces={o.totalPieces} />
                  </>
                )}
              </QueryState>
            </section>
          </div>
        )}
      </QueryState>
    </Drawer>
  );
}
