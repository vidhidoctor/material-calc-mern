import type { MaterialRateDto, TypeRateDto } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../api/client';
import { DataGrid, type Column } from '../../../components/DataGrid';
import { Modal } from '../../../components/Modal';
import { EmptyState, ErrorAlert, Field, NumberInput, parseNumberInput, QueryState } from '../../../components/ui';
import { formatMoney, formatNumber } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';

const ratePath = (key: string) => `/costing/rates/${encodeURIComponent(key)}`;

function useRates() {
  return useQuery({ queryKey: queryKeys.rates, queryFn: () => api<MaterialRateDto[]>('/costing/rates') });
}

function useTypeRates() {
  return useQuery({ queryKey: [...queryKeys.costing, 'type-rates'], queryFn: () => api<TypeRateDto[]>('/costing/type-rates') });
}

function useSaveTypeRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ category, type, basicRate, gstPercent }: { category: string; type: string; basicRate: number; gstPercent: number }) =>
      api<TypeRateDto[]>(`/costing/type-rates/${encodeURIComponent(category)}/${encodeURIComponent(type)}`, {
        method: 'PUT',
        body: { basicRate, gstPercent },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.costing }),
  });
}

/** Rate of one type (e.g. Sequence · PURE GLASS ₹8,000 per roll + 5%). */
function TypeRateModal({ row, onClose }: { row: TypeRateDto; onClose: () => void }) {
  const save = useSaveTypeRate();
  const [basic, setBasic] = useState(row.basicRate === null ? '' : String(row.basicRate));
  const [gst, setGst] = useState(row.gstPercent === null ? '5' : String(row.gstPercent));
  const basicValue = parseNumberInput(basic);
  const gstValue = parseNumberInput(gst) ?? 0;
  const incl = basicValue === null ? null : basicValue * (1 + gstValue / 100);

  return (
    <Modal
      open
      title={`${row.categoryName} · ${row.type}`}
      onClose={onClose}
      onSubmit={() =>
        basicValue !== null &&
        save.mutate({ category: row.category, type: row.type, basicRate: basicValue, gstPercent: gstValue }, { onSuccess: onClose })
      }
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || basicValue === null || gstValue > 100}>
            {save.isPending ? 'Saving…' : 'Save rate'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={save.error} />
        <div className="grid-2">
          <Field label={`Rate (₹ per ${row.purchaseUnit}) — incl. job/cutting`} required>
            <NumberInput decimal autoFocus value={basic} onChange={setBasic} placeholder="e.g. 8000" />
          </Field>
          <Field label="GST %" required>
            <NumberInput decimal value={gst} onChange={setGst} />
          </Field>
        </div>
        <div className="rate-preview">
          <span className="muted small">Rate incl. GST</span>
          <strong>{incl === null ? '—' : `${formatMoney(incl, 4)} per ${row.purchaseUnit}`}</strong>
          <span className="muted small">Applies to every {row.categoryName.toLowerCase()} size; the cost per piece uses each size's conversion.</span>
        </div>
      </div>
    </Modal>
  );
}

/** One table per typed category: types × materials, like the rate sheet. */
function TypeRatesSection() {
  const typeRates = useTypeRates();
  const [editing, setEditing] = useState<TypeRateDto | null>(null);
  if (!typeRates.data || typeRates.data.length === 0) return null;
  const categories = [...new Set(typeRates.data.map((r) => r.category))];

  return (
    <>
      {categories.map((category) => {
        const rows = typeRates.data!.filter((r) => r.category === category);
        const first = rows[0]!;
        return (
          <section key={category} className="card">
            <header className="card-header">
              <div>
                <h2>{first.categoryName} — rate by type</h2>
                <span className="muted small">
                  Rate per {first.purchaseUnit} (incl. job/cutting) + GST; cost per {first.unit} for each size. The type is chosen per order in Production.
                </span>
              </div>
            </header>
            <div className="table-wrap">
              <table className="table clean-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="align-right">Rate</th>
                    <th className="align-right">GST</th>
                    <th className="align-right">Incl. GST</th>
                    {first.perMaterial.map((m) => (
                      <th key={m.code} className="align-right">
                        {m.code}
                        <span className="th-unit">₹ / {first.unit}</span>
                      </th>
                    ))}
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.type}>
                      <td>
                        <strong>{r.type}</strong>
                      </td>
                      <td className="align-right">{r.basicRate === null ? <span className="muted">Not set</span> : formatMoney(r.basicRate)}</td>
                      <td className="align-right">{r.gstPercent === null ? '—' : `${formatNumber(r.gstPercent)}%`}</td>
                      <td className="align-right">{formatMoney(r.rateInclGst)}</td>
                      {r.perMaterial.map((m) => (
                        <td key={m.code} className="align-right cost-figure">
                          {m.costPerUnit === null ? <span className="muted">—</span> : formatMoney(m.costPerUnit, 5)}
                        </td>
                      ))}
                      <td className="align-right">
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(r)}>
                          {r.basicRate === null ? 'Set rate' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {editing && <TypeRateModal row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function useRateMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: queryKeys.costing });
  const save = useMutation({
    mutationFn: ({ key, basicRate, gstPercent }: { key: string; basicRate: number; gstPercent: number }) =>
      api<MaterialRateDto[]>(ratePath(key), { method: 'PUT', body: { basicRate, gstPercent } }),
    onSuccess,
  });
  const remove = useMutation({ mutationFn: (key: string) => api<MaterialRateDto[]>(ratePath(key), { method: 'DELETE' }), onSuccess });
  return { save, remove };
}

const label = (r: MaterialRateDto) => (r.color ? `${r.code} · ${r.color}` : r.code);

/** Edit a rate: basic rate per purchase unit + GST %. Rate incl. GST is shown live; cost per piece after saving. */
function RateModal({ row, onClose }: { row: MaterialRateDto; onClose: () => void }) {
  const { save } = useRateMutations();
  const [basic, setBasic] = useState(row.inherited || row.basicRate === null ? '' : String(row.basicRate));
  const [gst, setGst] = useState(row.inherited || row.gstPercent === null ? '12' : String(row.gstPercent));
  const basicValue = parseNumberInput(basic);
  const gstValue = parseNumberInput(gst) ?? 0;
  const incl = basicValue === null ? null : basicValue * (1 + gstValue / 100);

  return (
    <Modal
      open
      title={`Rate — ${label(row)}`}
      onClose={onClose}
      onSubmit={() => basicValue !== null && save.mutate({ key: row.key, basicRate: basicValue, gstPercent: gstValue }, { onSuccess: onClose })}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || basicValue === null || gstValue > 100}>
            {save.isPending ? 'Saving…' : 'Save rate'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={save.error} />
        {row.color && (
          <div className="alert alert-info">
            A rate only for <strong>{row.color}</strong> {row.code}. Without it, this colour uses the {row.code} rate.
          </div>
        )}
        <div className="grid-2">
          <Field label={`Basic rate (₹ per ${row.purchaseUnit || 'unit'})`} required>
            <NumberInput decimal autoFocus value={basic} onChange={setBasic} placeholder="e.g. 900" />
          </Field>
          <Field label="GST %" required>
            <NumberInput decimal value={gst} onChange={setGst} />
          </Field>
        </div>
        <div className="rate-preview">
          <span className="muted small">Rate incl. GST</span>
          <strong>{incl === null ? '—' : `${formatMoney(incl, 4)} per ${row.purchaseUnit || 'unit'}`}</strong>
          <span className="muted small">
            Cost per {row.unit || 'unit'} is worked out from the material's conversion rule when you save.
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** Admin only (COST_VIEW): rates per material, or per colour, and the resulting cost per piece. */
export function RatesTab() {
  const rates = useRates();
  const { remove } = useRateMutations();
  const [editing, setEditing] = useState<MaterialRateDto | null>(null);

  const columns: Column<MaterialRateDto>[] = [
    {
      key: 'material',
      header: 'Material',
      render: (r) => (
        <div>
          <strong className="mono">{r.code}</strong>
          {r.color && <span className="badge badge-blue color-badge">{r.color}</span>}
          {r.inherited && <span className="sub-figure">Uses {r.code} rate</span>}
        </div>
      ),
    },
    {
      key: 'basic',
      header: 'Basic rate',
      align: 'right',
      render: (r) => (r.basicRate === null ? <span className="muted">Not set</span> : `${formatMoney(r.basicRate)} / ${r.purchaseUnit}`),
    },
    { key: 'gst', header: 'GST', align: 'right', render: (r) => (r.gstPercent === null ? '—' : `${formatNumber(r.gstPercent)}%`) },
    { key: 'incl', header: 'Rate incl. GST', align: 'right', render: (r) => (r.rateInclGst === null ? '—' : `${formatMoney(r.rateInclGst)} / ${r.purchaseUnit}`) },
    {
      key: 'cost',
      header: 'Cost per unit',
      align: 'right',
      render: (r) =>
        r.costPerUnit !== null ? (
          <strong className="cost-figure">
            {formatMoney(r.costPerUnit, 4)} / {r.unit}
          </strong>
        ) : r.error ? (
          <span className="rule-error">{r.error}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <button type="button" className="btn btn-sm" onClick={() => setEditing(r)}>
            {r.color && r.inherited ? 'Set own rate' : r.basicRate === null ? 'Set rate' : 'Edit'}
          </button>
          {r.color && !r.inherited && r.basicRate !== null && (
            <button
              type="button"
              className="btn btn-sm btn-danger-ghost"
              disabled={remove.isPending}
              onClick={() => window.confirm(`Remove the ${label(r)} rate? It will use the ${r.code} rate again.`) && remove.mutate(r.key)}
            >
              Use material rate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <p className="muted small">
        Enter the basic rate per purchase unit and GST. The cost per piece/metre is worked out with each material's conversion rule (e.g. ₹1,008 per KG ÷
        80,000 pcs per KG = ₹0.0126 per bead). Colours used in designs are listed under their material and can have their own rate.
      </p>
      <TypeRatesSection />
      <ErrorAlert error={remove.error} />
      <QueryState query={rates}>
        {(list) => (
          <section className="card">
            <DataGrid
              columns={columns}
              rows={list}
              rowKey={(r) => r.key}
              rowClassName={(r) => (r.color ? 'row-variant' : undefined)}
              empty={<EmptyState title="No materials yet." />}
            />
          </section>
        )}
      </QueryState>
      {editing && <RateModal row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
