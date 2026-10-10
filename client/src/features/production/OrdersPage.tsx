import type { OrderListItemDto } from '@app/shared';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, PageHeader, QueryState } from '../../components/ui';
import { formatDate, formatNumber } from '../../lib/format';
import { OrderDrawer } from './components/OrderDrawer';
import { OrderStatusBadge, orderQuantityText } from './components/OrderStatusBadge';
import { useOrders } from './production.hooks';
import { useSelectedOrder } from './useSelectedOrder';

/** Matches the order label (ABC-1), design number (ignoring dashes/spaces) or party. */
function matches(order: OrderListItemDto, search: string): boolean {
  const q = search.trim().toUpperCase().replace(/^#/, '');
  if (!q) return true;
  const key = q.replace(/[\s-]+/g, '');
  return `${order.party}-${order.partyOrderNo}`.includes(q) || order.designNo.replace(/[\s-]+/g, '').includes(key) || order.party.includes(q);
}

export function OrdersPage() {
  const orders = useOrders();
  const [search, setSearch] = useState('');
  const [selected, select] = useSelectedOrder();

  const columns: Column<OrderListItemDto>[] = [
    {
      key: 'orderNo',
      header: 'Order',
      render: (o) => (
        <button type="button" className="link-btn strong-link" onClick={() => select(o.orderNo)}>
          {o.party}-{o.partyOrderNo}
        </button>
      ),
    },
    {
      key: 'design',
      header: 'Design',
      render: (o) => <Link to={`/production/${encodeURIComponent(o.designNo)}`}>{o.designNo}</Link>,
    },
    { key: 'item', header: 'Item', render: (o) => o.item },
    { key: 'party', header: 'Party', render: (o) => o.party },
    { key: 'date', header: 'Date', render: (o) => formatDate(o.orderDate) },
    { key: 'qty', header: 'Order Quantity', align: 'right', render: (o) => orderQuantityText(o.quantity) },
    { key: 'pieces', header: 'Total pieces', align: 'right', render: (o) => formatNumber(o.totalPieces, 0) },
    { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (o) => (
        <button type="button" className="btn btn-sm" onClick={() => select(o.orderNo)}>
          Details
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="All orders" subtitle="Newest first. Open an order to see its quantities and material requirement." />
      <section className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search order (e.g. ABC-1), design no. or party"
            aria-label="Search orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <QueryState query={orders}>
          {(list) => (
            <DataGrid
              columns={columns}
              rows={list.filter((o) => matches(o, search))}
              rowKey={(o) => String(o.orderNo)}
              rowClassName={(o) => (o.orderNo === selected ? 'row-selected' : undefined)}
              empty={
                <EmptyState title={list.length === 0 ? 'No orders yet.' : 'No order matches your search.'}>
                  {list.length === 0 ? 'Create one from Design search → a design → “+ Create New Order”.' : null}
                </EmptyState>
              }
            />
          )}
        </QueryState>
      </section>
      {selected !== null && <OrderDrawer orderNo={selected} onClose={() => select(null)} />}
    </>
  );
}

/** Old /orders/12 links open the order's drawer on All orders. */
export function OrderRedirect() {
  const raw = useParams().orderNo ?? '';
  return <Navigate to={/^\d+$/.test(raw) ? `/orders?order=${raw}` : '/orders'} replace />;
}
