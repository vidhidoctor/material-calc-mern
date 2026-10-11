import type { MaterialRateDto } from '@app/shared';
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
