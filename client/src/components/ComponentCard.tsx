import { parseVariantKey, variantLabel, type DesignComponentDto, type DesignSizeDto, type MaterialColumnDto } from '@app/shared';
import { DataGrid, type Column } from './DataGrid';
import { formatNumber } from '../lib/format';

interface Props {
  component: DesignComponentDto;
  materials: MaterialColumnDto[];
  onEdit?: () => void;
  onRemove?: () => void;
  removing?: boolean;
}

/** One component: its sizes, Stitch, Laser and per-piece consumption (only the columns chosen for it, incl. colours). */
export function ComponentCard({ component, materials, onEdit, onRemove, removing }: Props) {
  const units = new Map(materials.map((m) => [m.code, m.unit]));
  const used = component.columns.map((key) => ({ key, ...parseVariantKey(key), unit: units.get(parseVariantKey(key).code) ?? '' }));

  const columns: Column<DesignSizeDto>[] = [
    { key: 'size', header: 'Size', render: (s) => <strong>{s.size}</strong> },
    { key: 'stitch', header: 'Stitch', align: 'right', render: (s) => formatNumber(s.stitch, 0) },
    { key: 'laser', header: 'Laser', align: 'right', render: (s) => (s.laser === null ? <span className="muted">—</span> : formatNumber(s.laser, 0)) },
    ...used.map<Column<DesignSizeDto>>((c) => ({
      key: c.key,
      header: (
        <span title={`${variantLabel(c.key)} (${c.unit} per piece)`}>
          {c.code}
          <span className="th-unit">{c.color ? `${c.color} · ${c.unit}` : c.unit}</span>
        </span>
      ),
      align: 'right',
      render: (s) => {
        const qty = s.consumption[c.key];
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
            {component.sizes.length} size{component.sizes.length === 1 ? '' : 's'} · {used.length} column{used.length === 1 ? '' : 's'}
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
