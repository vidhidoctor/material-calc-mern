import type { DesignComponentDto, DesignSizeDto, MaterialColumnDto } from '@app/shared';
import { DataGrid, type Column } from './DataGrid';
import { formatNumber } from '../lib/format';

interface Props {
  component: DesignComponentDto;
  materials: MaterialColumnDto[];
  onEdit?: () => void;
  onRemove?: () => void;
  removing?: boolean;
}

/** One component: its sizes, Stitch, Laser and per-piece consumption (only materials it uses). */
export function ComponentCard({ component, materials, onEdit, onRemove, removing }: Props) {
  const used = materials.filter((m) => component.sizes.some((s) => (s.consumption[m.code] ?? 0) > 0));

  const columns: Column<DesignSizeDto>[] = [
    { key: 'size', header: 'Size', render: (s) => <strong>{s.size}</strong> },
    { key: 'stitch', header: 'Stitch', align: 'right', render: (s) => formatNumber(s.stitch, 0) },
    { key: 'laser', header: 'Laser', align: 'right', render: (s) => (s.laser === null ? <span className="muted">—</span> : formatNumber(s.laser, 0)) },
    ...used.map<Column<DesignSizeDto>>((m) => ({
      key: m.code,
      header: (
        <span title={`${m.code} (${m.unit} per piece)`}>
          {m.code}
          <span className="th-unit">{m.unit}</span>
        </span>
      ),
      align: 'right',
      render: (s) => {
        const qty = s.consumption[m.code];
        return qty ? formatNumber(qty, 4) : <span className="muted">—</span>;
      },
    })),
  ];

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>{component.name}</h2>
          <span className="muted small">
            {component.sizes.length} size{component.sizes.length === 1 ? '' : 's'} · {used.length} material{used.length === 1 ? '' : 's'} used
          </span>
        </div>
        <div className="row-actions">
          {onEdit && (
            <button type="button" className="btn btn-sm" onClick={onEdit}>
              Edit
            </button>
          )}
          {onRemove && (
            <button type="button" className="btn btn-sm btn-danger-ghost" disabled={removing} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </header>
      <DataGrid columns={columns} rows={component.sizes} rowKey={(s) => s.size} />
    </section>
  );
}
