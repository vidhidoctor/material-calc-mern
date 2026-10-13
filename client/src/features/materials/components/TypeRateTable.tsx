import type { TypeRateTableDto } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../api/client';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field, NumberInput, parseNumberInput } from '../../../components/ui';
import { formatMoney, formatNumber } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';

type TypeRow = TypeRateTableDto['types'][number];

function useTables() {
  return useQuery({ queryKey: [...queryKeys.costing, 'type-rate-tables'], queryFn: () => api<TypeRateTableDto[]>('/costing/type-rate-tables') });
}

function useInvalidateCosting() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([queryKeys.costing, queryKeys.materials, queryKeys.purchase].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Roll price of one type: basic + GST (use GST 0 to enter a gross price that already includes GST). */
function TypePriceModal({ table, row, onClose }: { table: TypeRateTableDto; row: TypeRow; onClose: () => void }) {
  const invalidate = useInvalidateCosting();
  const [basic, setBasic] = useState(row.basicRate === null ? '' : String(row.basicRate));
  const [gst, setGst] = useState(row.gstPercent === null ? '5' : String(row.gstPercent));
  const basicValue = parseNumberInput(basic);
  const gstValue = parseNumberInput(gst) ?? 0;
  const incl = basicValue === null ? null : basicValue * (1 + gstValue / 100);
  const save = useMutation({
    mutationFn: () =>
      api(`/costing/type-rates/${encodeURIComponent(table.category)}/${encodeURIComponent(row.type)}`, {
        method: 'PUT',
        body: { basicRate: basicValue, gstPercent: gstValue },
      }),
    onSuccess: invalidate,
  });

  return (
    <Modal
      open
      title={`${table.categoryName} · ${row.type} — price per ${table.purchaseUnit}`}
      onClose={onClose}
      onSubmit={() => basicValue !== null && save.mutate(undefined, { onSuccess: onClose })}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || basicValue === null || gstValue > 100}>
            {save.isPending ? 'Saving…' : 'Save price'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={save.error} />
        <div className="grid-2">
          <Field label={`Price per ${table.purchaseUnit} (roll + cutting)`} required>
            <NumberInput decimal autoFocus value={basic} onChange={setBasic} placeholder="e.g. 8000" />
          </Field>
          <Field label="GST %" required hint="Enter 0 if the price already includes GST.">
            <NumberInput decimal value={gst} onChange={setGst} />
          </Field>
        </div>
        <div className="rate-preview">
          <span className="muted small">Price incl. GST (used for all sizes)</span>
          <strong>{incl === null ? '—' : `${formatMoney(incl, 2)} per ${table.purchaseUnit}`}</strong>
        </div>
      </div>
    </Modal>
  );
}

/** One editable row: a size with its production values (inputs) and calculated costs per type. */
function SizeRow({ table, material, showStep }: { table: TypeRateTableDto; material: TypeRateTableDto['materials'][number]; showStep: string | null }) {
  const invalidate = useInvalidateCosting();
  const initial = () => Object.fromEntries(table.fields.map((f) => [f.key, material.rules[f.key] === undefined ? '' : String(material.rules[f.key])]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const dirty = table.fields.some((f) => (parseNumberInput(values[f.key] ?? '') ?? undefined) !== material.rules[f.key]);
  const invalid = table.fields.some((f) => f.required && !(parseNumberInput(values[f.key] ?? '') ?? 0));
  const save = useMutation({
    mutationFn: () =>
      api(`/materials/${encodeURIComponent(material.code)}`, {
        method: 'PUT',
        body: { category: table.category, rules: Object.fromEntries(table.fields.map((f) => [f.key, parseNumberInput(values[f.key] ?? '')])) },
      }),
    onSuccess: invalidate,
  });

  return (
    <tr className={dirty ? 'row-dirty' : undefined}>
      <td>
        <strong className="mono">{material.code}</strong>
        {save.error && <span className="rule-error sub-figure">{save.error instanceof Error ? save.error.message : 'Could not save.'}</span>}
      </td>
      {table.fields.map((f) => (
        <td key={f.key} className="input-cell">
          <NumberInput
            decimal
            className={`input-sm ${f.required && !(parseNumberInput(values[f.key] ?? '') ?? 0) ? 'invalid' : ''}`}
            aria-label={`${material.code} ${f.label}`}
            value={values[f.key] ?? ''}
            onChange={(v) => setValues((current) => ({ ...current, [f.key]: v }))}
          />
        </td>
      ))}
      {table.types.map((t) => {
        const cost = material.costs[t.type];
        const value = showStep ? cost?.perStep[showStep] : cost?.perUnit;
        return (
          <td key={t.type} className={`align-right cost-figure ${dirty ? 'is-stale' : ''}`}>
            {value ? formatMoney(value, showStep ? 2 : 5) : <span className="muted">—</span>}
          </td>
        );
      })}
      <td className="align-right">
        {dirty && (
          <div className="icon-actions">
            <button
              type="button"
              className="icon-action icon-cancel"
              aria-label={`Undo changes to ${material.code}`}
              title="Undo changes"
              onClick={() => setValues(initial())}
            >
              ✕
            </button>
            <button
              type="button"
              className="icon-action icon-save"
              aria-label={`Save ${material.code}`}
              title={invalid ? 'Fill in every required value' : 'Save'}
              disabled={save.isPending || invalid}
              onClick={() => save.mutate()}
            >
              {save.isPending ? '…' : '✓'}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Sheet-style rate table for typed categories (e.g. Sequence): editable roll price per type (header)
 * and production values per size (row inputs); the cost cells are calculated by the system.
 */
export function TypeRateTables() {
  const tables = useTables();
  const [editing, setEditing] = useState<{ table: TypeRateTableDto; row: TypeRow } | null>(null);
  const [per, setPer] = useState<Record<string, string>>({});
  if (!tables.data || tables.data.length === 0) return null;

  return (
    <>
      {tables.data.map((table) => {
        // Default view: per first step (e.g. per CD), else per piece.
        const showStep = per[table.category] ?? table.steps[0]?.key ?? '';
        const stepLabel = table.steps.find((s) => s.key === showStep)?.label;
        return (
          <section key={table.category} className="card">
            <header className="card-header">
              <div>
                <h2>{table.categoryName} — rate table</h2>
                <span className="muted small">
                  Inputs: price per {table.purchaseUnit} for each type (✎) and the values of each size. Green cells are calculated (
                  {stepLabel ? `cost per ${stepLabel} = price ÷ ${stepLabel} per ${table.purchaseUnit}` : `cost per ${table.unit}`}).
                </span>
              </div>
              {table.steps.length > 0 && (
                <div className="segmented" role="group" aria-label="Show cost per">
                  {table.steps.map((s) => (
                    <button key={s.key} type="button" aria-pressed={showStep === s.key} onClick={() => setPer((p) => ({ ...p, [table.category]: s.key }))}>
                      Per {s.label}
                    </button>
                  ))}
                  <button type="button" aria-pressed={showStep === ''} onClick={() => setPer((p) => ({ ...p, [table.category]: '' }))}>
                    Per {table.unit === 'PCS' ? 'piece' : table.unit}
                  </button>
                </div>
              )}
            </header>
            <div className="table-wrap">
              <table className="table clean-table rate-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>Size</th>
                    {table.fields.map((f) => (
                      <th key={f.key} rowSpan={2} className="align-right input-head">
                        {f.label}
                      </th>
                    ))}
                    {table.types.map((t) => (
                      <th key={t.type} className="align-right type-head">
                        <span>{t.type}</span>
                        <button type="button" className="price-btn" title={`Edit ${t.type} price`} onClick={() => setEditing({ table, row: t })}>
                          {t.rateInclGst === null ? 'Set price' : `${formatMoney(t.rateInclGst, 0)} ✎`}
                        </button>
                      </th>
                    ))}
                    <th rowSpan={2} aria-label="Actions" />
                  </tr>
                  <tr>
                    {table.types.map((t) => (
                      <th key={t.type} className="align-right sub-head">
                        ₹ / {stepLabel ?? table.unit}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.materials.map((m) => (
                    <SizeRow key={m.code} table={table} material={m} showStep={showStep || null} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {editing && <TypePriceModal table={editing.table} row={editing.row} onClose={() => setEditing(null)} />}
    </>
  );
}
