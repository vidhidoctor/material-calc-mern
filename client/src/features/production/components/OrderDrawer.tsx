import { variantLabel } from '@app/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Drawer } from '../../../components/Drawer';
import { ErrorAlert, QueryState } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate, formatMoney, formatNumber } from '../../../lib/format';
import { useDeleteOrder, useOrder, useOrderCost, useOrders, useOrderSummary, useProductionDesign } from '../production.hooks';
import { NewOrderModal } from './NewOrderModal';
import { OrderLinesTable } from './OrderLinesTable';

/** Everything about one order: stats, quantities and material requirement. */
export function OrderDrawer({ orderNo, onClose }: { orderNo: number; onClose: () => void }) {
  const auth = useAuth();
  const order = useOrder(orderNo);
  const summary = useOrderSummary(orderNo);
  const cost = useOrderCost(orderNo, auth.can('COST_VIEW'));
  const remove = useDeleteOrder();
  const [editing, setEditing] = useState(false);
  // Only loaded while editing: the design (for the form) and previous parties (suggestions).
  const design = useProductionDesign(editing && order.data ? order.data.designNo : '');
  const allOrders = useOrders();
  const parties = useMemo(() => [...new Set((allOrders.data ?? []).map((o) => o.party))].sort(), [allOrders.data]);

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
          {auth.can('PRODUCTION_UPDATE') && (
            <button type="button" className="btn" disabled={!order.data} onClick={() => setEditing(true)}>
              Edit order
            </button>
          )}
          {auth.can('PURCHASE_REQUIREMENT_VIEW') && (
            <Link className="btn footer-note" to={`/purchase?orderNo=${orderNo}`}>
              Procurement planning
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
              {cost.data && (
                <div className="stat stat-cost">
                  <span className="muted small">Material cost</span>
                  <strong>{formatMoney(cost.data.total)}</strong>
                  <span className="muted small">{formatMoney(cost.data.perPiece)} per piece</span>
                </div>
              )}
            </div>
            {cost.data && (cost.data.errors.length > 0 || cost.data.usesCurrentRates) && (
              <div className="alert alert-info small">
                {cost.data.usesCurrentRates && <p>Some rates were not saved with this order, so today's rates are used for them.</p>}
                {cost.data.errors.length > 0 && (
                  <ul>
                    {cost.data.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}


            {Object.keys(o.types).length > 0 && (
              <div className="order-type-list">
                <span className="muted small">Types chosen</span>
                <div className="tags">
                  {Object.entries(o.types).map(([key, type]) => (
                    <span key={key} className="tag">
                      {variantLabel(key)} → <strong>{type}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                    <OrderLinesTable summary={s} cost={cost.data} types={o.types} />
                  </>
                )}
              </QueryState>
            </section>
          </div>
        )}
      </QueryState>
      {editing && order.data && design.data && (
        <NewOrderModal
          design={design.data}
          parties={parties}
          order={order.data}
          onClose={() => setEditing(false)}
          onCreated={() => setEditing(false)}
        />
      )}
    </Drawer>
  );
}
