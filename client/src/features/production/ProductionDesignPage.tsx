import type { PreviousOrderDto } from '@app/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ComponentCard } from '../../components/ComponentCard';
import { EmptyState, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNumber } from '../../lib/format';
import { NewOrderModal } from './components/NewOrderModal';
import { OrderDrawer } from './components/OrderDrawer';
import { useOrders, useProductionDesign } from './production.hooks';
import { useSelectedOrder } from './useSelectedOrder';

interface PartyGroup {
  party: string;
  orders: PreviousOrderDto[];
  latest: string;
}

/** Parties with their orders (#1 first); parties with the most recent order first. */
function groupByParty(orders: PreviousOrderDto[]): PartyGroup[] {
  const groups = new Map<string, PreviousOrderDto[]>();
  for (const order of orders) groups.set(order.party, [...(groups.get(order.party) ?? []), order]);
  return [...groups]
    .map(([party, list]) => {
      const sorted = [...list].sort((a, b) => a.partyOrderNo - b.partyOrderNo);
      const latest = sorted.reduce((max, o) => (o.orderDate > max ? o.orderDate : max), sorted[0]!.orderDate);
      return { party, orders: sorted, latest };
    })
    .sort((a, b) => b.latest.localeCompare(a.latest) || a.party.localeCompare(b.party));
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function ProductionDesignPage() {
  const designNo = useParams().designNo ?? '';
  const auth = useAuth();
  const design = useProductionDesign(designNo);
  const allOrders = useOrders();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useSelectedOrder();
  const [showPunching, setShowPunching] = useState(false);

  const parties = useMemo(() => [...new Set((allOrders.data ?? []).map((o) => o.party))].sort(), [allOrders.data]);

  return (
    <>
      <Link to="/production" className="back-link">
        ← Design & Order Lookup
      </Link>
      <QueryState query={design}>
        {(d) => {
          const groups = groupByParty(d.previousOrders);
          return (
            <>
              <PageHeader
                title={`Design ${d.designNo}`}
                subtitle={
                  <>
                    <strong>{d.productName}</strong> · {plural(d.previousOrders.length, 'order')} · {plural(groups.length, 'party', 'parties')}
                  </>
                }
                actions={
                  auth.can('PRODUCTION_CREATE') &&
                  d.components.length > 0 && (
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                      + Create New Order
                    </button>
                  )
                }
              />

              <section className="card">
                <header className="card-header">
                  <h2>Orders by party</h2>
                  <span className="muted small">Click a party to see its orders, then an order for its details.</span>
                </header>
                {groups.length === 0 ? (
                  <EmptyState title="No orders for this design yet.">
                    {auth.can('PRODUCTION_CREATE') ? 'Create the first one with “+ Create New Order”.' : null}
                  </EmptyState>
                ) : (
                  <div className="party-list">
                    {groups.map((group) => (
                      // Collapsed by default, unless the design has a single party.
                      <details key={group.party} className="party" open={groups.length === 1}>
                        <summary>
                          <strong className="party-name">{group.party}</strong>
                          <span className="muted small">
                            {plural(group.orders.length, 'order')} · Latest: {formatDate(group.latest)}
                          </span>
                        </summary>
                        <div className="order-history">
                          <div className="order-history-title">Order history</div>
                          {group.orders.map((order) => (
                            <button
                              key={order.orderNo}
                              type="button"
                              className={`order-row ${selected === order.orderNo ? 'order-row-active' : ''}`}
                              onClick={() => setSelected(order.orderNo)}
                            >
                              <strong className="order-no">#{order.partyOrderNo}</strong>
                              <span className="order-pcs">{formatNumber(order.totalPieces, 0)} pcs</span>
                              <span className="order-date">{formatDate(order.orderDate)}</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>

              <section className="card">
                <header className="card-header">
                  <h2>Punching details</h2>
                  <button type="button" className="btn btn-sm" aria-expanded={showPunching} onClick={() => setShowPunching((s) => !s)}>
                    {showPunching ? 'Hide' : `Show ${plural(d.components.length, 'component')}`}
                  </button>
                </header>
                {showPunching && (
                  <div className="nested-cards">
                    {d.components.map((c) => (
                      <ComponentCard key={c.name} component={c} materials={d.materials} />
                    ))}
                  </div>
                )}
              </section>

              {creating && <NewOrderModal
                  design={d}
                  parties={parties}
                  onClose={() => setCreating(false)}
                  onCreated={(orderNo) => {
                    setCreating(false);
                    setSelected(orderNo);
                  }}
                />}
              {selected !== null && <OrderDrawer orderNo={selected} onClose={() => setSelected(null)} />}
            </>
          );
        }}
      </QueryState>
    </>
  );
}
