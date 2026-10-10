import type { OrderListItemDto } from '@app/shared';
import { useState } from 'react';
import { formatDate, formatNumber } from '../../../lib/format';

const labelOf = (o: OrderListItemDto) => `${o.party}-${o.partyOrderNo}`;

/** Matches the order label (ABC-1), design number (ignoring dashes/spaces) or party. */
function matches(order: OrderListItemDto, search: string): boolean {
  const q = search.trim().toUpperCase().replace(/^#/, '');
  const key = q.replace(/[\s-]+/g, '');
  return labelOf(order).includes(q) || order.designNo.replace(/[\s-]+/g, '').includes(key) || order.party.includes(q);
}

/** Search box with a short list of matching orders below it. */
export function OrderPicker({ orders, onPick }: { orders: OrderListItemDto[]; onPick: (orderNo: number) => void }) {
  const [search, setSearch] = useState('');
  const results = search.trim() ? orders.filter((o) => matches(o, search)).slice(0, 8) : [];

  return (
    <div className="order-picker">
      <input
        className="input"
        type="search"
        placeholder="Find an order: ABC-1, design no. or party"
        aria-label="Find an order"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length === 1) {
            e.preventDefault();
            onPick(results[0]!.orderNo);
            setSearch('');
          }
        }}
      />
      {search.trim() && (
        <div className="picker-results" role="listbox" aria-label="Matching orders">
          {results.length === 0 ? (
            <div className="muted small picker-empty">No order matches “{search.trim()}”.</div>
          ) : (
            results.map((o) => (
              <button
                key={o.orderNo}
                type="button"
                role="option"
                aria-selected={false}
                className="picker-row"
                onClick={() => {
                  onPick(o.orderNo);
                  setSearch('');
                }}
              >
                <strong>{labelOf(o)}</strong>
                <span>Design {o.designNo}</span>
                <span className="muted small">
                  {formatNumber(o.totalPieces, 0)} pcs · {formatDate(o.orderDate)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
