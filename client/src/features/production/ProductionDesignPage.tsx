import type { PreviousOrderDto } from '@app/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ComponentCard } from '../../components/ComponentCard';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNumber } from '../../lib/format';
import { NewOrderModal } from './components/NewOrderModal';
import { OrderStatusBadge, orderQuantityText } from './components/OrderStatusBadge';
import { useOrders, useProductionDesign } from './production.hooks';

export function ProductionDesignPage() {
  const designNo = useParams().designNo ?? '';
  const auth = useAuth();
  const design = useProductionDesign(designNo);
  const orders = useOrders();
  const [creating, setCreating] = useState(false);
  const [showPunching, setShowPunching] = useState(false);

  const parties = useMemo(() => [...new Set((orders.data ?? []).map((o) => o.party))].sort(), [orders.data]);

  const columns: Column<PreviousOrderDto>[] = [
    {
      key: 'orderNo',
      header: '#',
      render: (o) => (
        <Link className="strong-link" to={`/orders/${o.orderNo}`}>
          #{o.orderNo}
        </Link>
      ),
    },
    { key: 'design', header: 'Design No.', render: () => designNo },
    { key: 'party', header: 'Party', render: (o) => o.party },
    { key: 'qty', header: 'Order Quantity', align: 'right', render: (o) => orderQuantityText(o.quantity) },
    { key: 'pieces', header: 'Total pieces', align: 'right', render: (o) => formatNumber(o.totalPieces, 0) },
    { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge status={o.status} /> },
    { key: 'date', header: 'Date', render: (o) => formatDate(o.orderDate) },
  ];

  return (
    <>
      <Link to="/production" className="back-link">
        ← Design search
      </Link>
      <QueryState query={design}>
        {(d) => (
          <>
            <PageHeader
              title={`Design ${d.designNo}`}
              subtitle={<strong>{d.productName}</strong>}
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
                <h2>Previous orders</h2>
                <span className="muted small">{d.previousOrders.length} total</span>
              </header>
              <DataGrid
                columns={columns}
                rows={d.previousOrders}
                rowKey={(o) => String(o.orderNo)}
                empty={<EmptyState title="No orders for this design yet." />}
              />
            </section>

            <section className="card">
              <header className="card-header">
                <h2>Punching details</h2>
                <button type="button" className="btn btn-sm" aria-expanded={showPunching} onClick={() => setShowPunching((s) => !s)}>
                  {showPunching ? 'Hide' : `Show ${d.components.length} component${d.components.length === 1 ? '' : 's'}`}
                </button>
              </header>
              {showPunching && (
                <div className="nested-cards">
                  {d.components.length === 0 ? (
                    <EmptyState title="No components yet." />
                  ) : (
                    d.components.map((c) => <ComponentCard key={c.name} component={c} materials={d.materials} />)
                  )}
                </div>
              )}
            </section>

            {creating && <NewOrderModal design={d} parties={parties} onClose={() => setCreating(false)} />}
          </>
        )}
      </QueryState>
    </>
  );
}
