import type { ProductionDesignDetailDto } from '@app/shared';
import { useMemo, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field, NumberInput, parseNumberInput } from '../../../components/ui';
import { formatNumber } from '../../../lib/format';
import type { OrderLineBody } from '../production.api';
import { useCreateOrder } from '../production.hooks';

type Mode = 'same' | 'rows';

/** Today's date (local) as YYYY-MM-DD for <input type="date">. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const rowKey = (component: string, size: string) => `${component}\u0000${size}`;

interface Props {
  design: ProductionDesignDetailDto;
  /** Previous parties, suggested in the Party field. */
  parties: string[];
  onClose: () => void;
  /** Called with the new order number (the page then opens its drawer). */
  onCreated: (orderNo: number) => void;
}

export function NewOrderModal({ design, parties, onClose, onCreated }: Props) {
  const create = useCreateOrder();
  const [party, setParty] = useState('');
  const [orderDate, setOrderDate] = useState(today);
  const [mode, setMode] = useState<Mode>('same');
  const [quantity, setQuantity] = useState('');
  const [rowQty, setRowQty] = useState<Record<string, string>>({});

  const rows = useMemo(
    () => design.components.flatMap((c) => c.sizes.map((s) => ({ component: c.name, size: s.size }))),
    [design.components],
  );

  /** Quantity of one component + size in the current mode (0 = not ordered). */
  const qtyOf = (component: string, size: string): number =>
    mode === 'same' ? (parseNumberInput(quantity) ?? 0) : (parseNumberInput(rowQty[rowKey(component, size)] ?? '') ?? 0);

  // Footer: "N of M rows · X pieces". Blank/0 = not ordered.
  const quantities = rows.map((r) => qtyOf(r.component, r.size));
  const ordered = quantities.filter((q) => q > 0).length;
  const pieces = quantities.reduce((sum, q) => sum + q, 0);
  const canCreate = party.trim() !== '' && orderDate !== '' && ordered > 0;

  const onSubmit = () => {
    if (!canCreate) return;
    const base = { designNo: design.designNo, party: party.trim(), orderDate };
    const body =
      mode === 'same'
        ? { ...base, quantity: parseNumberInput(quantity) ?? 0 }
        : {
            ...base,
            lines: rows
              .map<OrderLineBody>((r) => ({ ...r, quantity: qtyOf(r.component, r.size) }))
              .filter((line) => line.quantity > 0),
          };
    create.mutate(body, { onSuccess: (order) => onCreated(order.orderNo) });
  };

  return (
    <Modal
      open
      title={`New order — ${design.designNo} · ${design.productName}`}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <span className="footer-note order-count">
            <strong>
              {ordered} of {rows.length} rows
            </strong>{' '}
            · {formatNumber(pieces, 0)} pieces
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !canCreate}>
            {create.isPending ? 'Creating…' : 'Create order'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={create.error} />

        <div className="order-top">
          <Field label="Party" required>
            <input
              className="input upper"
              required
              autoFocus
              list="party-suggestions"
              value={party}
              onChange={(e) => setParty(e.target.value.toUpperCase())}
            />
            <datalist id="party-suggestions">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Order date" required>
            <input className="input" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </Field>
          <Field label="Order Quantity" required={mode === 'same'}>
            <NumberInput
              value={mode === 'same' ? quantity : ''}
              disabled={mode === 'rows'}
              placeholder={mode === 'rows' ? 'Per row' : '0'}
              onChange={setQuantity}
            />
          </Field>
        </div>

        <div className="segmented" role="group" aria-label="Order quantity mode">
          <button type="button" aria-pressed={mode === 'same'} onClick={() => setMode('same')}>
            Same for all rows
          </button>
          <button type="button" aria-pressed={mode === 'rows'} onClick={() => setMode('rows')}>
            Different per row
          </button>
        </div>

        {mode === 'rows' && (
          <div className="order-components">
            {design.components.map((component) => (
              // Accordion (all collapsed at first): click a component to show its sizes, one below the other.
              <details key={component.name} className="order-component">
                <summary>
                  <strong>{component.name}</strong>
                  <span className="muted small">
                    {component.sizes.length} size{component.sizes.length === 1 ? '' : 's'}
                  </span>
                </summary>
                <div className="order-sizes">
                  {component.sizes.map((s) => {
                    const key = rowKey(component.name, s.size);
                    return (
                      <label key={s.size} className="order-size">
                        <span>{s.size}</span>
                        <NumberInput
                          className="input-sm"
                          aria-label={`${component.name} ${s.size} quantity`}
                          placeholder="0"
                          value={rowQty[key] ?? ''}
                          onChange={(v) => setRowQty((q) => ({ ...q, [key]: v }))}
                        />
                      </label>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
