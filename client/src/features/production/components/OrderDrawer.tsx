import type { OrderCostDto, OrderDto } from '@app/shared';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Drawer } from '../../../components/Drawer';
import { Icon, type IconName } from '../../../components/Icon';
import { MaterialBreakdown } from '../../../components/MaterialBreakdown';
import { ErrorAlert, QueryState } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate, formatMoney, formatNumber } from '../../../lib/format';
import { downloadPurchaseCsv } from '../purchase-sheet';
import {
  useDeleteOrder,
  useOrder,
  useOrderBreakdown,
  useOrderCost,
  useOrders,
  useOrderSummary,
  useProductionDesign,
  useRefreshOrderRates,
} from '../production.hooks';
import { NewOrderModal } from './NewOrderModal';
import { PurchaseSummary } from './PurchaseSummary';

type Tab = 'purchase' | 'components' | 'cost';

function InfoItem({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="order-info-item">
      <Icon name={icon} size={22} />
      <div>
        <span className="muted small">{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function StatCard({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="order-stat">
      <span className="order-stat-icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="order-stat-body">
        <span className="muted small">{label}</span>
        {children}
      </div>
    </div>
  );
}

/** Pieces per size over all components, e.g. "18: 460 | 20: 1,000". */
function piecesBySize(order: OrderDto): { size: string; pieces: number }[] {
  const bySize = new Map<string, number>();
  for (const line of order.lines) bySize.set(line.size, (bySize.get(line.size) ?? 0) + line.quantity);
  return [...bySize].map(([size, pieces]) => ({ size, pieces }));
}

/** Material cost per component and size (Admin), with the rates saved with the order. */
function CostBreakup({ cost }: { cost: OrderCostDto }) {
  return (
    <div className="stack">
      {(cost.errors.length > 0 || cost.usesCurrentRates) && (
        <div className="alert alert-info small">
          {cost.usesCurrentRates && <p>Some rates were not saved with this order, so today's rates are used for them.</p>}
          {cost.errors.length > 0 && (
            <ul>
              {cost.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="table-wrap po-table-wrap">
        <table className="po-table">
          <thead>
            <tr>
              <th className="po-size">Component</th>
              <th>Size</th>
              <th>Pcs</th>
              <th>Cost ₹</th>
            </tr>
          </thead>
          <tbody>
            {cost.components.map((c) => (
              <Fragment key={c.component}>
                {cost.rows
                  .filter((r) => r.component === c.component)
                  .map((r, i) => (
                    <tr key={r.size}>
                      <td className="po-size">{i === 0 ? c.component : ''}</td>
                      <td>{r.size}</td>
                      <td>{formatNumber(r.quantity, 0)}</td>
                      <td>{formatMoney(r.cost)}</td>
                    </tr>
                  ))}
                {cost.components.length > 1 && (
                  <tr className="po-subtotal">
                    <td className="po-size">{c.component} total</td>
                    <td />
                    <td>{formatNumber(c.quantity, 0)}</td>
                    <td>{formatMoney(c.cost)}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="po-size">Total</td>
              <td />
              <td>{formatNumber(cost.components.reduce((s, c) => s + c.quantity, 0), 0)}</td>
              <td>
                <span className="po-total">{formatMoney(cost.total)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Everything about one order: details, stats, purchase requirement, component detail and cost. */
export function OrderDrawer({ orderNo, onClose }: { orderNo: number; onClose: () => void }) {
  const auth = useAuth();
  const order = useOrder(orderNo);
  const summary = useOrderSummary(orderNo);
  const cost = useOrderCost(orderNo, auth.can('COST_VIEW'));
  const remove = useDeleteOrder();
  const refresh = useRefreshOrderRates(orderNo);
  const breakdown = useOrderBreakdown(orderNo);
  const [tab, setTab] = useState<Tab>('purchase');
  const [editing, setEditing] = useState(false);
  // Only loaded while editing: the design (for the form) and previous parties (suggestions).
  const design = useProductionDesign(editing && order.data ? order.data.designNo : '');
  const allOrders = useOrders();
  const parties = useMemo(() => [...new Set((allOrders.data ?? []).map((o) => o.party))].sort(), [allOrders.data]);
  const label = order.data ? `${order.data.party}-${order.data.partyOrderNo}` : '';

  const onDelete = () => {
    if (window.confirm(`Delete order ${label || 'this order'}? It is removed from all lists and purchase requirements. This cannot be undone.`)) {
      remove.mutate(orderNo, { onSuccess: onClose });
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'purchase', label: 'Purchase Requirement' },
    { id: 'components', label: 'Component Details' },
    ...(cost.data ? [{ id: 'cost' as const, label: 'Cost Breakup' }] : []),
  ];

  return (
    <Drawer
      open
      wide
      title={<span className="drawer-title">Order Details{label ? ` – ${label}` : ''}</span>}
      onClose={onClose}
      footer={
        <>
          {auth.can('PRODUCTION_UPDATE') && (
            <button type="button" className="btn btn-danger-ghost" disabled={remove.isPending} onClick={onDelete}>
              Delete
            </button>
          )}
          {auth.can('PRODUCTION_UPDATE') && (
            <button type="button" className="btn btn-ghost footer-note" disabled={!order.data} onClick={() => setEditing(true)}>
              Edit order
            </button>
          )}
          <button type="button" className="btn btn-lg" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!order.data || !summary.data || summary.data.columns.length === 0}
            onClick={() => order.data && summary.data && downloadPurchaseCsv(summary.data, order.data)}
          >
            <Icon name="download" size={18} /> Export Purchase List
          </button>
        </>
      }
    >
      <QueryState query={order}>
        {(o) => (
          <div className="stack order-details">
            <ErrorAlert error={remove.error ?? refresh.error} />

            <div className="order-info">
              <InfoItem icon="code" label="Design No." value={o.designNo} />
              <InfoItem icon="bag" label="Item" value={o.item} />
              <InfoItem icon="users" label="Party" value={o.party} />
              <InfoItem icon="calendar" label="Order Date" value={formatDate(o.orderDate)} />
            </div>

            <div className="order-stats">
              <StatCard icon="package" label="Total Pieces">
                <strong className="order-stat-value">{formatNumber(o.totalPieces, 0)}</strong>
                <span className="order-stat-sizes">
                  {piecesBySize(o).map(({ size, pieces }, i) => (
                    <Fragment key={size}>
                      {i > 0 && <span className="order-stat-sep">|</span>}
                      <span>
                        {size}: {formatNumber(pieces, 0)}
                      </span>
                    </Fragment>
                  ))}
                </span>
              </StatCard>
              <StatCard icon="calendar" label="Order Date">
                <strong className="order-stat-value">{formatDate(o.orderDate)}</strong>
              </StatCard>
              {cost.data && (
                <StatCard icon="rupee" label="Material Cost">
                  <strong className="order-stat-value order-stat-money">{formatMoney(cost.data.total)}</strong>
                  <span className="muted small">{formatMoney(cost.data.perPiece)} per piece</span>
                  <button
                    type="button"
                    className="link-btn small order-stat-link"
                    disabled={refresh.isPending}
                    title="This order keeps the rates saved when it was created. Use this to re-price it with today's rates."
                    onClick={() =>
                      window.confirm("Re-price this order with today's rates? Its material cost will change and the old rates are replaced.") &&
                      refresh.mutate()
                    }
                  >
                    <Icon name="refresh" size={14} /> {refresh.isPending ? 'Updating…' : "Use today's rates"}
                  </button>
                </StatCard>
              )}
            </div>

            <div className="order-tabs" role="tablist" aria-label="Order details">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'purchase' && <QueryState query={summary}>{(s) => <PurchaseSummary summary={s} order={o} />}</QueryState>}
            {tab === 'components' && (
              <div className="stack">
                <p className="muted small">Per material: quantity per piece, conversion (e.g. cord grams = metres × denier ÷ 9000) and total for this order.</p>
                {breakdown.data ? <MaterialBreakdown data={breakdown.data} mode="order" /> : null}
              </div>
            )}
            {tab === 'cost' && cost.data && <CostBreakup cost={cost.data} />}
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
