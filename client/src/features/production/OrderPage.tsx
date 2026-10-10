import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus, type OrderSummaryRowDto } from '@app/shared';
import { Link, useParams } from 'react-router';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, ErrorAlert, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNumber } from '../../lib/format';
import { OrderStatusBadge, orderQuantityText } from './components/OrderStatusBadge';
import { useOrder, useOrderSummary, useUpdateOrderStatus } from './production.hooks';

export function OrderPage() {
  const raw = useParams().orderNo ?? '';
  const orderNo = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(orderNo)) {
    return (
      <div className="card">
        <EmptyState title="Invalid order number." />
      </div>
    );
  }
  return <OrderDetail orderNo={orderNo} />;
}

function OrderDetail({ orderNo }: { orderNo: number }) {
  const auth = useAuth();
  const order = useOrder(orderNo);
  const summary = useOrderSummary(orderNo);
  const status = useUpdateOrderStatus(orderNo);

  return (
    <>
      <Link to="/orders" className="back-link">
        ← All orders
      </Link>
      <QueryState query={order}>
        {(o) => (
          <>
            <PageHeader
              title={`Order #${o.orderNo}`}
              subtitle={
                <>
                  <Link to={`/production/${encodeURIComponent(o.designNo)}`}>Design {o.designNo}</Link> · {o.item} · {o.party} ·{' '}
                  {formatDate(o.orderDate)}
                </>
              }
              actions={
                <>
                  {auth.can('PURCHASE_REQUIREMENT_VIEW') && (
                    <Link className="btn" to={`/purchase?orderNo=${o.orderNo}`}>
                      Purchase requirement
                    </Link>
                  )}
                  {auth.can('PRODUCTION_UPDATE') ? (
                    <label className="status-select">
                      <span className="muted small">Status</span>
                      <select
                        className="input"
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
                    </label>
                  ) : (
                    <OrderStatusBadge status={o.status} />
                  )}
                </>
              }
            />
            <ErrorAlert error={status.error} />

            <div className="stat-row">
              <div className="stat">
                <span className="muted small">Order Quantity</span>
                <strong>{orderQuantityText(o.quantity)}</strong>
              </div>
              <div className="stat">
                <span className="muted small">Rows ordered</span>
                <strong>{formatNumber(o.lines.length, 0)}</strong>
              </div>
              <div className="stat">
                <span className="muted small">Total pieces</span>
                <strong>{formatNumber(o.totalPieces, 0)}</strong>
              </div>
            </div>

            <section className="card">
              <header className="card-header">
                <h2>Material requirement per row</h2>
                <span className="muted small">Consumption per piece × quantity, from the design's current Punching values.</span>
              </header>
              <QueryState query={summary}>
                {(s) => {
                  const used = s.materials.filter((m) => s.totals[m.code] !== undefined);
                  const columns: Column<OrderSummaryRowDto>[] = [
                    { key: 'component', header: 'Component', render: (r) => <strong>{r.component}</strong> },
                    { key: 'size', header: 'Size', render: (r) => r.size },
                    { key: 'qty', header: 'Qty', align: 'right', render: (r) => formatNumber(r.quantity, 0) },
                    ...used.map<Column<OrderSummaryRowDto>>((m) => ({
                      key: m.code,
                      header: (
                        <span title={`${m.code} (${m.unit})`}>
                          {m.code}
                          <span className="th-unit">{m.unit}</span>
                        </span>
                      ),
                      align: 'right',
                      render: (r) => {
                        const value = r.requirements[m.code];
                        return value ? formatNumber(value) : <span className="muted">—</span>;
                      },
                    })),
                  ];
                  return (
                    <>
                      {s.errors.length > 0 && (
                        <div className="alert alert-error section-alert">
                          <ul>
                            {s.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <DataGrid
                        columns={columns}
                        rows={s.rows}
                        rowKey={(r) => `${r.component}|${r.size}`}
                        footer={
                          <tr>
                            <td colSpan={2}>Total</td>
                            <td className="align-right">{formatNumber(o.totalPieces, 0)}</td>
                            {used.map((m) => (
                              <td key={m.code} className="align-right">
                                {formatNumber(s.totals[m.code])}
                              </td>
                            ))}
                          </tr>
                        }
                      />
                    </>
                  );
                }}
              </QueryState>
            </section>
          </>
        )}
      </QueryState>
    </>
  );
}
