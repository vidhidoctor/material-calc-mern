import { Link } from 'react-router';
import { Drawer } from '../../../components/Drawer';
import { QueryState } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate, formatNumber } from '../../../lib/format';
import { useOrder, useOrderSummary } from '../production.hooks';
import { OrderLinesTable } from './OrderLinesTable';

/** Everything about one order: stats, quantities and material requirement. */
export function OrderDrawer({ orderNo, onClose }: { orderNo: number; onClose: () => void }) {
  const auth = useAuth();
  const order = useOrder(orderNo);
  const summary = useOrderSummary(orderNo);

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
