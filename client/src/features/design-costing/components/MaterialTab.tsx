import type { DesignCostingCalculationDto, DesignCostingDto } from '@app/shared';
import { DataGrid, type Column } from '../../../components/DataGrid';
import { EmptyState, NumberInput } from '../../../components/ui';
import { formatRupees, formatNumber } from '../../../lib/format';
import type { Draft } from '../costing-draft';

type Material = DesignCostingCalculationDto['materials'][number];

interface Props {
  data: DesignCostingDto;
  calculation: DesignCostingCalculationDto;
  draft: Draft;
  canManage: boolean;
  setType: (key: string, type: string) => void;
  setCord: (key: string, field: 'denier' | 'rate', value: string) => void;
}

const columns: Column<Material>[] = [
  {
    key: 'material',
    header: 'Material',
    render: (m) => (
      <>
        <strong>{m.label}</strong>
        {m.detail && <span className="muted small"> · {m.detail}</span>}
      </>
    ),
  },
  { key: 'qty', header: 'Quantity', align: 'right', render: (m) => `${formatNumber(m.qty, 4)} ${m.unit}` },
  { key: 'cost', header: 'Cost', align: 'right', render: (m) => (m.cost === null ? <span className="muted">No rate</span> : formatRupees(m.cost)) },
];

/** What one piece of every size consumes, and the choices orders normally make (type, cord denier and rate). */
export function MaterialTab({ data, calculation, draft, canManage, setType, setCord }: Props) {
  return (
    <div className="costing-tab">
      {(data.typed.length > 0 || data.cords.length > 0) && (
        <section className="card costing-panel">
          <h2>Material pricing choices</h2>
          <p className="muted small">
            Types and cords are chosen on each order, so choose here what this costing uses. Orders are not affected. All other material rates come from Material Master.
          </p>
          <div className="costing-choices">
            {data.typed.map((column) => (
              <label key={column.key} className="order-type-row">
                <span>{column.label}</span>
                <select
                  className="input input-sm"
                  aria-label={`${column.categoryName} type for ${column.label}`}
                  disabled={!canManage}
                  value={draft.types[column.key] ?? ''}
                  onChange={(e) => setType(column.key, e.target.value)}
                >
                  <option value="">Choose type…</option>
                  {column.types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {data.cords.map((column) => (
              <div key={column.key} className="order-type-row">
                <span>{column.label}</span>
                <span className="costing-cord">
                  <label>
                    <span className="muted small">Denier</span>
                    <NumberInput
                      decimal
                      className="input-sm"
                      aria-label={`Denier for ${column.label}`}
                      disabled={!canManage}
                      value={draft.cords[column.key]?.denier ?? ''}
                      onChange={(v) => setCord(column.key, 'denier', v)}
                    />
                  </label>
                  <label>
                    <span className="muted small">₹ / {column.rateUnit}</span>
                    <NumberInput
                      decimal
                      className="input-sm"
                      aria-label={`Rate per ${column.rateUnit} for ${column.label}`}
                      disabled={!canManage}
                      value={draft.cords[column.key]?.rate ?? ''}
                      onChange={(v) => setCord(column.key, 'rate', v)}
                    />
                  </label>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <header className="card-header">
          <div>
            <h2>Material Requirement</h2>
            <span className="muted small">One piece of every size, across all components.</span>
          </div>
        </header>
        <DataGrid columns={columns} rows={calculation.materials} rowKey={(m) => m.key} empty={<EmptyState title="No material entered in Punching yet." />} />
      </section>
    </div>
  );
}
