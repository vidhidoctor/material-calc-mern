import type { OrderListItemDto } from '@app/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, PageHeader, QueryState } from '../../components/ui';
import { formatDate, formatNumber } from '../../lib/format';
import { OrderStatusBadge, orderQuantityText } from './components/OrderStatusBadge';
import { useOrders } from './production.hooks';

const columns: Column<OrderListItemDto>[] = [
  {
    key: 'orderNo',
    header: '#',
    render: (o) => (
      <Link className="strong-link" to={`/orders/${o.orderNo}`}>
        #{o.orderNo}
      </Link>
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
];

/** Matches order #, design number (ignoring dashes/spaces) or party. */
function matches(order: OrderListItemDto, search: string): boolean {
  const q = search.trim().toUpperCase().replace(/^#/, '');
  if (!q) return true;
  const key = q.replace(/[\s-]+/g, '');
  return (
    String(order.orderNo) === q ||
    order.designNo.replace(/[\s-]+/g, '').includes(key) ||
    order.party.includes(q)
  );
}

export function OrdersPage() {
  const orders = useOrders();
  const [search, setSearch] = useState('');

  return (
    <>
      <PageHeader title="All orders" subtitle="Newest first. Open an order to see its material requirement or change its status." />
      <section className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search order #, design no. or party"
            aria-label="Search orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <QueryState query={orders}>
          {(list) => {
            const rows = list.filter((o) => matches(o, search));
            return (
              <DataGrid
                columns={columns}
                rows={rows}
                rowKey={(o) => String(o.orderNo)}
                empty={
                  <EmptyState title={list.length === 0 ? 'No orders yet.' : 'No order matches your search.'}>
                    {list.length === 0 ? 'Create one from Design search → a design → “+ Create New Order”.' : null}
                  </EmptyState>
                }
              />
            );
          }}
        </QueryState>
      </section>
    </>
  );
}
