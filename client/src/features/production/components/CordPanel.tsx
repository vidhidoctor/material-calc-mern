import type { OrderSummaryColumnDto, OrderSummaryDto } from '@app/shared';
import { useEffect, useMemo, useState } from 'react';
import { DenierCalculator } from '../../../components/DenierCalculator';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, NumberInput, parseNumberInput } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatMoney, formatNumber } from '../../../lib/format';
import { columnLabel, columnTitle } from '../purchase-sheet';
import type { OrderCordsBody } from '../production.api';
import { usePreviewOrderCords, useSaveOrderCords } from '../production.hooks';

/**
 * Cord section of the order drawer. Material Master keeps only the material Cord; each order gets its own
 * denier and rate per KG (incl. GST), entered in a popup. Weight = length × denier ÷ 9,000,000 and
 * cost = weight × rate are worked out by the server (the cord category's formula).
 */
export function CordPanel({ summary, types, orderLabel }: { summary: OrderSummaryDto; types: Record<string, string>; orderLabel: string }) {
  const auth = useAuth();
  const canEdit = auth.can('PRODUCTION_UPDATE');
  const canCost = auth.can('COST_VIEW');
  const [open, setOpen] = useState(false);
  const cords = summary.columns.filter((c) => c.cord);
  if (cords.length === 0) return null;

  return (
    <div className="denier-panel">
      <div className="denier-panel-head">
        <h4>Cord</h4>
        <span className="muted small">Denier{canCost ? ' and rate per KG' : ''} are entered for this order.</span>
        {canEdit && (
          <button type="button" className="btn btn-sm btn-primary cord-edit" onClick={() => setOpen(true)}>
            {canCost ? 'Enter denier & rate' : 'Enter denier'}
          </button>
        )}
      </div>
      <div className="table-wrap po-table-wrap">
        <table className="po-table denier-table">
          <thead>
            <tr>
              <th className="po-size">Cord</th>
              <th>Total length</th>
              <th>Denier</th>
              <th>Weight</th>
              {canCost && <th>Rate / KG (incl. GST)</th>}
              {canCost && <th>Cord cost</th>}
            </tr>
          </thead>
          <tbody>
            {cords.map((c) => (
              <CordRow key={c.key} column={c} summary={summary} types={types} canCost={canCost} />
            ))}
          </tbody>
        </table>
      </div>
      {open && <CordModal summary={summary} types={types} canCost={canCost} orderLabel={orderLabel} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CordRow({ column: c, summary, types, canCost }: { column: OrderSummaryColumnDto; summary: OrderSummaryDto; types: Record<string, string>; canCost: boolean }) {
  const label = columnLabel(c, types, summary.columns);
  const weight = summary.buy[c.key];
  return (
    <tr>
      <td className="po-size">
        {columnTitle(c)}
        {label && <span className="po-variant">{label}</span>}
      </td>
      <td>
        {formatNumber(summary.totals[c.key])} <span className="purchase-unit">{c.unit}</span>
      </td>
      <td>{c.cord!.denier !== null ? formatNumber(c.cord!.denier) : <span className="text-danger small">Not entered</span>}</td>
      <td>
        {weight && c.orderUnit ? (
          <strong>
            {formatNumber(weight, 3)} <span className="unit-weight-text">{c.orderUnit}</span>
          </strong>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      {canCost && <td>{c.cord!.ratePerUnit !== null ? formatMoney(c.cord!.ratePerUnit) : <span className="text-danger small">Not entered</span>}</td>}
      {canCost && (
        <td>
          <strong>{c.cord!.cost !== null ? formatMoney(c.cord!.cost) : '—'}</strong>
        </td>
      )}
    </tr>
  );
}

type Entry = { denier: string; rate: string };

/** Popup: denier (and rate per KG incl. GST for users who see costs) per cord, with weight and cost as you type. */
function CordModal({
  summary,
  types,
  canCost,
  orderLabel,
  onClose,
}: {
  summary: OrderSummaryDto;
  types: Record<string, string>;
  canCost: boolean;
  orderLabel: string;
  onClose: () => void;
}) {
  const cords = summary.columns.filter((c) => c.cord);
  const save = useSaveOrderCords(summary.orderNo);
  const preview = usePreviewOrderCords(summary.orderNo);
  const [values, setValues] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      cords.map((c) => [c.key, { denier: c.cord!.denier !== null ? String(c.cord!.denier) : '', rate: c.cord!.ratePerUnit ?? '' }]),
    ),
  );
  const set = (key: string, patch: Partial<Entry>) => setValues((v) => ({ ...v, [key]: { ...v[key]!, ...patch } }));

  const invalid = (text: string) => text.trim() !== '' && !((parseNumberInput(text) ?? 0) > 0);
  const hasInvalid = cords.some((c) => invalid(values[c.key]!.denier) || (canCost && invalid(values[c.key]!.rate)));
  const body = useMemo<OrderCordsBody>(
    () =>
      Object.fromEntries(
        cords.map((c) => {
          const v = values[c.key]!;
          const denier = v.denier.trim() === '' ? null : parseNumberInput(v.denier);
          const rate = v.rate.trim() === '' ? null : parseNumberInput(v.rate);
          return [c.key, canCost ? { denier, ratePerUnit: rate } : { denier }];
        }),
      ),
    [values, canCost],
  );

  // Weight and cost from the server while typing (nothing is saved).
  const { mutate: runPreview } = preview;
  const bodyKey = JSON.stringify(body);
  useEffect(() => {
    if (hasInvalid) return;
    const timer = setTimeout(() => runPreview(JSON.parse(bodyKey) as OrderCordsBody), 300);
    return () => clearTimeout(timer);
  }, [bodyKey, hasInvalid, runPreview]);
  const shown = preview.data ?? summary;

  // Order and cord shown under the title, e.g. "Order: FR-1 | Cord: CREAM".
  const cordName = (c: OrderSummaryColumnDto) => columnLabel(c, types, summary.columns) || columnTitle(c);
  const [calcFor, setCalcFor] = useState(cords[0]?.key ?? '');

  return (
    <Modal
      open
      wide
      title={canCost ? 'Cord denier & rate for this order' : 'Cord denier for this order'}
      onClose={onClose}
      onSubmit={() => !hasInvalid && save.mutate(body, { onSuccess: onClose })}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={hasInvalid || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack cord-modal">
        <p className="cord-modal-sub">
          Order: {orderLabel}
          {cords.length === 1 && (
            <>
              <span className="cord-modal-sep">|</span>Cord: {cordName(cords[0]!)}
            </>
          )}
        </p>
        <p className="muted small cord-modal-formula">
          Weight (KG) = Total length (metres) × Denier ÷ 9,000,000{canCost ? ' · Cord cost = Weight × Rate per KG (incl. GST)' : ''}. Saved
          for this order only.
        </p>
        <ErrorAlert error={save.error ?? preview.error} />

        {cords.map((c) => {
          const v = values[c.key]!;
          const col = shown.columns.find((x) => x.key === c.key);
          const weight = shown.buy[c.key];
          return (
            <section key={c.key} className="cord-card">
              <h3>Cord details{cords.length > 1 ? ` — ${cordName(c)}` : ''}</h3>
              <div className={`cord-inputs ${canCost ? '' : 'cord-inputs-2'}`}>
                <div className="cord-field">
                  <span className="cord-label">Total length (Metres)</span>
                  <div className="cord-readonly">
                    <strong>
                      {formatNumber(summary.totals[c.key])} {c.unit}
                    </strong>
                    <span className="muted small">From Punching Master</span>
                  </div>
                </div>
                <label className="cord-field">
                  <span className="cord-label">Denier</span>
                  <NumberInput
                    decimal
                    className={`input-lg ${invalid(v.denier) ? 'invalid' : ''}`}
                    value={v.denier}
                    onChange={(x) => set(c.key, { denier: x })}
                    placeholder="e.g. 1250"
                  />
                </label>
                {canCost && (
                  <label className="cord-field">
                    <span className="cord-label">Rate per KG (incl. GST) ₹</span>
                    <NumberInput
                      decimal
                      className={`input-lg ${invalid(v.rate) ? 'invalid' : ''}`}
                      value={v.rate}
                      onChange={(x) => set(c.key, { rate: x })}
                      placeholder="e.g. 550"
                    />
                  </label>
                )}
              </div>
              <div className={`cord-results ${canCost ? '' : 'cord-results-1'}`}>
                <div className="cord-field">
                  <span className="cord-label">Calculated weight (KG)</span>
                  <div className="cord-readonly cord-result-box">
                    <strong>{weight && col?.orderUnit ? `${formatNumber(weight, 3)} ${col.orderUnit}` : '—'}</strong>
                  </div>
                </div>
                {canCost && (
                  <div className="cord-field">
                    <span className="cord-label">Total cord cost (incl. GST) ₹</span>
                    <div className="cord-readonly cord-result-box">
                      <strong>{col?.cord?.cost ? formatNumber(col.cord.cost, 2) : '—'}</strong>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <DenierCalculator
          variant="card"
          targets={cords.length > 1 ? cords.map((c) => ({ value: c.key, label: cordName(c) })) : undefined}
          target={calcFor}
          onTargetChange={setCalcFor}
          onUse={(denier) => set(cords.length > 1 ? calcFor : cords[0]!.key, { denier: String(denier) })}
        />
      </div>
    </Modal>
  );
}
