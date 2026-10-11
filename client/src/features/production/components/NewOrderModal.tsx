import { parseVariantKey, variantLabel, type OrderDto, type ProductionDesignDetailDto } from '@app/shared';
import { useMemo, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field, NumberInput, parseNumberInput } from '../../../components/ui';
import { formatNumber } from '../../../lib/format';
import type { OrderLineBody } from '../production.api';
import { useCreateOrder, useUpdateOrder } from '../production.hooks';

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
  /** Called with the order number after it is created or saved. */
  onCreated: (orderNo: number) => void;
  /** Set to edit an existing order (every field except the design). */
  order?: OrderDto;
}

/** New order / Edit order: party, date, quantities and the type of every typed column (e.g. sequence finish). */
export function NewOrderModal({ design, parties, onClose, onCreated, order }: Props) {
  const create = useCreateOrder();
  const update = useUpdateOrder(order?.orderNo ?? 0);
  const mutation = order ? update : create;

  const [party, setParty] = useState(order?.party ?? '');
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? today);
  const [mode, setMode] = useState<Mode>(order && order.quantity === null ? 'rows' : 'same');
  const [quantity, setQuantity] = useState(order?.quantity != null ? String(order.quantity) : '');
  const [rowQty, setRowQty] = useState<Record<string, string>>(() =>
    order && order.quantity === null ? Object.fromEntries(order.lines.map((l) => [rowKey(l.component, l.size), String(l.quantity)])) : {},
  );
  const [types, setTypes] = useState<Record<string, string>>(order?.types ?? {});

  const rows = useMemo(
    () => design.components.flatMap((c) => c.sizes.map((s) => ({ component: c.name, size: s.size, consumption: s.consumption }))),
    [design.components],
  );

  /** Quantity of one component + size in the current mode (0 = not ordered). */
  const qtyOf = (component: string, size: string): number =>
    mode === 'same' ? (parseNumberInput(quantity) ?? 0) : (parseNumberInput(rowQty[rowKey(component, size)] ?? '') ?? 0);

  // Footer: "N of M rows · X pieces". Blank/0 = not ordered.
  const quantities = rows.map((r) => qtyOf(r.component, r.size));
  const ordered = quantities.filter((q) => q > 0).length;
  const pieces = quantities.reduce((sum, q) => sum + q, 0);

  // Typed columns (e.g. sequence colours) used by the ordered rows: Production picks their type here.
  const materialCategory = new Map(design.materials.filter((m) => m.typed).map((m) => [m.code, m.category]));
  const typedColumns = [
    ...new Set(
      rows
        .filter((r, i) => quantities[i]! > 0)
        .flatMap((r) => Object.keys(r.consumption))
        .filter((key) => materialCategory.has(parseVariantKey(key).code)),
    ),
  ].sort();
  const optionsFor = (key: string) => design.typeOptions.find((o) => o.category === materialCategory.get(parseVariantKey(key).code));
  const allTypes = [...new Set(design.typeOptions.flatMap((o) => o.types))];
  const typesMissing = typedColumns.filter((key) => !types[key]);

  const canSave = party.trim() !== '' && orderDate !== '' && ordered > 0 && typesMissing.length === 0;

  const onSubmit = () => {
    if (!canSave) return;
    const chosen = Object.fromEntries(typedColumns.map((key) => [key, types[key]!]));
    const base = { party: party.trim(), orderDate, types: chosen };
    const body =
      mode === 'same'
        ? { ...base, quantity: parseNumberInput(quantity) ?? 0 }
        : {
            ...base,
            lines: rows
              .map<OrderLineBody>((r) => ({ component: r.component, size: r.size, quantity: qtyOf(r.component, r.size) }))
              .filter((line) => line.quantity > 0),
          };
    if (order) update.mutate(body, { onSuccess: (saved) => onCreated(saved.orderNo) });
    else create.mutate({ ...body, designNo: design.designNo }, { onSuccess: (saved) => onCreated(saved.orderNo) });
  };

  return (
    <Modal
      open
      title={order ? `Edit order ${order.party}-${order.partyOrderNo} — ${design.designNo}` : `New order — ${design.designNo} · ${design.productName}`}
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
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending || !canSave}>
            {mutation.isPending ? 'Saving…' : order ? 'Save order' : 'Create order'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={mutation.error} />

        <div className="order-top">
          <Field label="Party" required hint={order ? 'A new party gives the order the next number of that party.' : undefined}>
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

        {typedColumns.length > 0 && (
          <section className="order-types">
            <div className="order-types-head">
              <strong>{design.typeOptions.map((o) => o.name).join(' / ')} types for this order</strong>
              <label className="set-all">
                <span className="muted small">Set all to</span>
                <select
                  className="input input-sm"
                  value=""
                  onChange={(e) => e.target.value && setTypes((t) => ({ ...t, ...Object.fromEntries(typedColumns.map((k) => [k, e.target.value])) }))}
                >
                  <option value="">Choose…</option>
                  {allTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {typedColumns.map((key) => (
              <label key={key} className="order-type-row">
                <span>{variantLabel(key)}</span>
                <select
                  className={`input input-sm ${types[key] ? '' : 'invalid'}`}
                  aria-label={`Type for ${variantLabel(key)}`}
                  value={types[key] ?? ''}
                  onChange={(e) => setTypes((t) => ({ ...t, [key]: e.target.value }))}
                >
                  <option value="">Choose type…</option>
                  {(optionsFor(key)?.types ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {typesMissing.length > 0 && <p className="muted small">Choose a type for every colour to {order ? 'save' : 'create'} the order.</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
