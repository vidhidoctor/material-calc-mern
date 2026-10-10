import type { ProductionDesignDetailDto } from '@app/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
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
}

export function NewOrderModal({ design, parties, onClose }: Props) {
  const navigate = useNavigate();
  const create = useCreateOrder();
  const [party, setParty] = useState('');
  const [orderDate, setOrderDate] = useState(today);
  const [mode, setMode] = useState<Mode>('same');
  const [quantity, setQuantity] = useState('');
  const [rowQty, setRowQty] = useState<Record<string, string>>({});
  const [fill, setFill] = useState<Record<string, string>>({});

  const rows = useMemo(
    () => design.components.flatMap((c) => c.sizes.map((s) => ({ component: c.name, size: s.size }))),
    [design.components],
  );

  // Footer: "N of M rows · X pieces". Blank/0 = not ordered.
  const { ordered, pieces } = useMemo(() => {
    if (mode === 'same') {
      const q = parseNumberInput(quantity) ?? 0;
      return { ordered: q > 0 ? rows.length : 0, pieces: q * rows.length };
    }
    const lines = rows.filter((r) => (parseNumberInput(rowQty[rowKey(r.component, r.size)] ?? '') ?? 0) > 0);
    const total = lines.reduce((sum, r) => sum + (parseNumberInput(rowQty[rowKey(r.component, r.size)]!) ?? 0), 0);
    return { ordered: lines.length, pieces: total };
  }, [mode, quantity, rowQty, rows]);

  const canCreate = party.trim() !== '' && orderDate !== '' && ordered > 0;

  const fillAll = (component: string) => {
    const value = fill[component] ?? '';
    const sizes = design.components.find((c) => c.name === component)?.sizes ?? [];
    setRowQty((q) => ({ ...q, ...Object.fromEntries(sizes.map((s) => [rowKey(component, s.size), value])) }));
  };

  const onSubmit = () => {
    if (!canCreate) return;
    const base = { designNo: design.designNo, party: party.trim(), orderDate };
    const body =
      mode === 'same'
        ? { ...base, quantity: parseNumberInput(quantity) ?? 0 }
        : {
            ...base,
            lines: rows
              .map<OrderLineBody>((r) => ({ ...r, quantity: parseNumberInput(rowQty[rowKey(r.component, r.size)] ?? '') ?? 0 }))
              .filter((line) => line.quantity > 0),
          };
    create.mutate(body, { onSuccess: (order) => navigate(`/orders/${order.orderNo}`) });
  };

  return (
    <Modal
      open
      wide={mode === 'rows'}
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
          <Field label="Order Quantity" required={mode === 'same'} hint={mode === 'rows' ? 'Set per row below.' : 'Used for every component + size.'}>
            <NumberInput value={mode === 'same' ? quantity : ''} disabled={mode === 'rows'} placeholder={mode === 'rows' ? '—' : '0'} onChange={setQuantity} />
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
          <div className="stack">
            {design.components.map((component) => (
              <section key={component.name} className="qty-group">
                <header className="qty-group-head">
                  <strong>{component.name}</strong>
                  <span className="muted small">
                    {component.sizes.length} size{component.sizes.length === 1 ? '' : 's'}
                  </span>
                  {component.sizes.length > 1 && (
                    <div className="fill-all">
                      <NumberInput
                        className="input-sm"
                        aria-label={`Quantity to fill for all ${component.name} sizes`}
                        placeholder="Qty"
                        value={fill[component.name] ?? ''}
                        onChange={(v) => setFill((f) => ({ ...f, [component.name]: v }))}
                      />
                      <button type="button" className="btn btn-sm" onClick={() => fillAll(component.name)}>
                        Fill all sizes
                      </button>
                    </div>
                  )}
                </header>
                <div className="qty-grid">
                  {component.sizes.map((s) => {
                    const key = rowKey(component.name, s.size);
                    return (
                      <label key={s.size} className="qty-cell">
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
              </section>
            ))}
            <p className="muted small">Blank or 0 = not ordered.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
