import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from '@app/shared';
import { Link, useParams } from 'react-router';
import { EmptyState, ErrorAlert, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNumber } from '../../lib/format';
import { OrderStatusBadge, orderQuantityText } from './components/OrderStatusBadge';
import { RequirementTable } from './components/RequirementTable';
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
                {(s) => (
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
                    <RequirementTable summary={s} totalPieces={o.totalPieces} />
                  </>
                )}
              </QueryState>
            </section>
          </>
        )}
      </QueryState>
    </>
  );
}
