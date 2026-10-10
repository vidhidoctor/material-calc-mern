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

  /** Quantity of one component + size in the current mode (0 = not ordered). */
  const qtyOf = (component: string, size: string): number =>
    mode === 'same' ? (parseNumberInput(quantity) ?? 0) : (parseNumberInput(rowQty[rowKey(component, size)] ?? '') ?? 0);

  // Footer: "N of M rows · X pieces". Blank/0 = not ordered.
  const quantities = rows.map((r) => qtyOf(r.component, r.size));
  const ordered = quantities.filter((q) => q > 0).length;
  const pieces = quantities.reduce((sum, q) => sum + q, 0);

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
      wide
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

        <p className="hint-box">
          {mode === 'same'
            ? 'Every component + size below is ordered at the Order Quantity. Switch to “Different per row” to enter a quantity per size.'
            : 'Enter how many pieces to make for each component + size. Leave blank (or 0) for sizes you are not ordering. “Fill all sizes” copies one quantity to every size of a component.'}
        </p>

        <div className="table-wrap order-lines">
          <table className="table">
            <thead>
              <tr>
                <th>Size</th>
                <th className="align-right">Stitch</th>
                <th>Material per piece</th>
                <th className="align-right">Order Quantity</th>
                <th className="align-right">Pieces</th>
              </tr>
            </thead>
            {design.components.map((component) => {
              const lineQty = component.sizes.map((s) => qtyOf(component.name, s.size));
              const orderedSizes = lineQty.filter((q) => q > 0).length;
              const subtotal = lineQty.reduce((sum, q) => sum + q, 0);
              return (
                <tbody key={component.name}>
                  <tr className="group-head">
                    <td colSpan={5}>
                      <div className="group-head-inner">
                        <strong>{component.name}</strong>
                        <span className="muted small">
                          {orderedSizes} of {component.sizes.length} size{component.sizes.length === 1 ? '' : 's'} · {formatNumber(subtotal, 0)} pcs
                        </span>
                        {mode === 'rows' && component.sizes.length > 1 && (
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
                      </div>
                    </td>
                  </tr>
                  {component.sizes.map((s, i) => {
                    const key = rowKey(component.name, s.size);
                    const used = Object.entries(s.consumption);
                    return (
                      <tr key={s.size} className={lineQty[i]! > 0 ? undefined : 'row-muted'}>
                        <td>
                          <strong>{s.size}</strong>
                        </td>
                        <td className="align-right">{formatNumber(s.stitch, 0)}</td>
                        <td>
                          {used.length === 0 ? (
                            <span className="muted small">No materials punched</span>
                          ) : (
                            <span className="consumption-list" title={used.map(([code, qty]) => `${code} ${qty}`).join(' · ')}>
                              {used.slice(0, 3).map(([code, qty]) => (
                                <span key={code} className="tag">
                                  {code} {formatNumber(qty, 4)}
                                </span>
                              ))}
                              {used.length > 3 && <span className="muted small">+{used.length - 3} more</span>}
                            </span>
                          )}
                        </td>
                        <td className="align-right qty-col">
                          {mode === 'rows' ? (
                            <NumberInput
                              className="input-sm"
                              aria-label={`${component.name} ${s.size} quantity`}
                              placeholder="0"
                              value={rowQty[key] ?? ''}
                              onChange={(v) => setRowQty((q) => ({ ...q, [key]: v }))}
                            />
                          ) : (
                            formatNumber(lineQty[i]!, 0)
                          )}
                        </td>
                        <td className="align-right">{lineQty[i]! > 0 ? formatNumber(lineQty[i]!, 0) : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
    </Modal>
  );
}
