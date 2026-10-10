import type { MaterialCategory, PurchaseTotalDto } from '@app/shared';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ComponentCard } from '../../components/ComponentCard';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNumber } from '../../lib/format';
import { BeadSection, CordSection, SequenceSection } from './components/MaterialSections';
import { OrderPicker } from './components/OrderPicker';
import { useOrderDesign, usePickerOrders, usePurchaseRequirements, useSelectedOrderDetail } from './purchase.hooks';

type CategoryFilter = 'ALL' | MaterialCategory;

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'SEQUENCE', label: 'Sequence' },
  { value: 'BEAD', label: 'Beads & decorative' },
  { value: 'CORD', label: 'Cord' },
];

const sum = (rows: PurchaseTotalDto[], pick: (row: PurchaseTotalDto) => string | undefined) =>
  rows.reduce((total, row) => total + Number(pick(row) ?? 0), 0);

export function PurchasePage() {
  const auth = useAuth();
  const canSeeOrders = auth.can('PRODUCTION_VIEW');

  // Order + components live in the URL (shareable, survive refresh); display filters are local.
  const [params, setParams] = useSearchParams();
  const rawOrder = params.get('orderNo');
  const orderNo = rawOrder && /^\d+$/.test(rawOrder) ? Number(rawOrder) : null;
  const components = useMemo(
    () => (params.get('components') ?? '').split(',').map((c) => c.trim()).filter(Boolean),
    [params],
  );
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [onlyRequired, setOnlyRequired] = useState(true);
  const [find, setFind] = useState('');
  const [showPunched, setShowPunched] = useState(false);

  const requirements = usePurchaseRequirements(orderNo, components);
  const orders = usePickerOrders();
  const order = useSelectedOrderDetail(orderNo);
  const design = useOrderDesign(order.data?.designNo ?? null);

  const setUrl = (next: { orderNo?: number | null; components?: string[] }) => {
    const p = new URLSearchParams(params);
    const o = next.orderNo !== undefined ? next.orderNo : orderNo;
    const c = next.components !== undefined ? next.components : components;
    if (o === null) p.delete('orderNo');
    else p.set('orderNo', String(o));
    if (c.length === 0) p.delete('components');
    else p.set('components', c.join(','));
    setParams(p);
  };

  const orderComponents = useMemo(() => [...new Set(order.data?.lines.map((l) => l.component) ?? [])], [order.data]);
  const toggleComponent = (name: string) =>
    setUrl({ components: components.includes(name) ? components.filter((c) => c !== name) : [...components, name] });

  const resetAll = () => {
    setUrl({ orderNo: null, components: [] });
    setCategory('ALL');
    setOnlyRequired(true);
    setFind('');
  };

  const data = requirements.data;
  const totals = data?.totals ?? [];
  const query = find.trim().toUpperCase();
  const visible = totals.filter(
    (m) =>
      (category === 'ALL' || m.category === category) &&
      (!onlyRequired || Number(m.total) > 0) &&
      (!query || m.code.includes(query) || m.name.toUpperCase().includes(query)),
  );
  const byCategory = (c: MaterialCategory) => visible.filter((m) => m.category === c);
  const cord = totals.filter((m) => m.category === 'CORD');
  const stale = requirements.isFetching && requirements.isPlaceholderData;
  const scope = orderNo === null ? 'All orders' : order.data ? `${order.data.party}-${order.data.partyOrderNo}` : `Order`;

  return (
    <>
      <PageHeader title="Procurement Planning" subtitle="Material to buy, from the design's current Punching values × ordered quantities." />

      <section className="card filters">
        <div className="filters-row">
          <div className="filters-order">
            <span className="filter-label">Order</span>
            {orderNo !== null ? (
              <div className="selected-order">
                <strong>{order.data ? `${order.data.party}-${order.data.partyOrderNo}` : `Order`}</strong>
                {order.data && (
                  <span className="muted small">
                    Design {order.data.designNo} · {order.data.item} · {formatNumber(order.data.totalPieces, 0)} pcs ·{' '}
                    {formatDate(order.data.orderDate)}
                  </span>
                )}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setUrl({ orderNo: null, components: [] })}>
                  ✕ Clear order
                </button>
              </div>
            ) : canSeeOrders ? (
              <OrderPicker orders={orders.data ?? []} onPick={(n) => setUrl({ orderNo: n, components: [] })} />
            ) : (
              <span className="muted small">Showing all orders.</span>
            )}
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={resetAll}>
            Reset all filters
          </button>
        </div>

        {orderNo !== null && orderComponents.length > 0 && (
          <div className="filters-row">
            <span className="filter-label">Components</span>
            <div className="chip-row">
              {orderComponents.map((c) => (
                <label key={c} className={`chip ${components.includes(c) ? 'chip-on' : ''}`}>
                  <input type="checkbox" checked={components.includes(c)} onChange={() => toggleComponent(c)} />
                  {c}
                </label>
              ))}
              <span className="muted small">{components.length === 0 ? 'None ticked = all components' : ''}</span>
            </div>
          </div>
        )}

        <div className="filters-row">
          <span className="filter-label">Show</span>
          <div className="segmented" role="group" aria-label="Category">
            {CATEGORY_OPTIONS.map((o) => (
              <button key={o.value} type="button" aria-pressed={category === o.value} onClick={() => setCategory(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={onlyRequired} onChange={(e) => setOnlyRequired(e.target.checked)} />
            <span>Only materials with a requirement</span>
          </label>
          <input
            className="input find-material"
            type="search"
            placeholder="Find material"
            aria-label="Find material"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
        </div>
      </section>

      {requirements.isPending ? (
        <Loading />
      ) : requirements.isError ? (
        <ErrorAlert error={requirements.error} />
      ) : (
        <div className={`stack ${stale ? 'is-stale' : ''}`}>
          <div className="summary-cards">
            <div className="stat">
              <span className="muted small">Sequence · rolls</span>
              <strong>{formatNumber(sum(totals, (m) => (m.purchase?.kind === 'SEQUENCE' ? m.purchase.rolls : undefined)))}</strong>
            </div>
            <div className="stat">
              <span className="muted small">Beads & decorative · KG</span>
              <strong>{formatNumber(sum(totals, (m) => (m.purchase?.kind === 'BEAD' ? m.purchase.kg : undefined)))}</strong>
            </div>
            <div className="stat">
              <span className="muted small">Cord · KG</span>
              <strong>{formatNumber(sum(cord, (m) => (m.purchase?.kind === 'CORD' ? m.purchase.kg : undefined)))}</strong>
              <span className="muted small">{formatNumber(sum(cord, (m) => m.total))} MTR</span>
            </div>
            <div className="stat">
              <span className="muted small">Based on</span>
              <strong className="stat-text">{scope}</strong>
              <span className="muted small">
                {data?.orderNos.length ?? 0} order{data?.orderNos.length === 1 ? '' : 's'}
                {components.length > 0 ? ` · ${components.join(', ')}` : ''}
              </span>
            </div>
          </div>

          {data && data.errors.length > 0 && (
            <div className="alert alert-error">
              <ul>
                {data.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {visible.length === 0 ? (
            <section className="card">
              <EmptyState title="Nothing to purchase for these filters.">
                {totals.length === 0 ? 'Add materials in Material Master and orders in Production first.' : 'Try another category, or untick “Only materials with a requirement”.'}
              </EmptyState>
            </section>
          ) : (
            <>
              {byCategory('SEQUENCE').length > 0 && <SequenceSection rows={byCategory('SEQUENCE')} />}
              {byCategory('BEAD').length > 0 && <BeadSection rows={byCategory('BEAD')} />}
              {byCategory('CORD').length > 0 && <CordSection rows={byCategory('CORD')} />}
            </>
          )}

          {orderNo !== null && design.data && (
            <section className="card">
              <header className="card-header">
                <h2>Punched details</h2>
                <button type="button" className="btn btn-sm" aria-expanded={showPunched} onClick={() => setShowPunched((s) => !s)}>
                  {showPunched ? 'Hide' : 'Show'}
                </button>
              </header>
              {showPunched && (
                <div className="nested-cards">
                  {design.data.components
                    .filter((c) => (components.length > 0 ? components.includes(c.name) : orderComponents.includes(c.name)))
                    .map((c) => (
                      <ComponentCard key={c.name} component={c} materials={design.data.materials} />
                    ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
