import { MATERIAL_CATEGORY_LABELS, type MaterialDto } from '@app/shared';
import { useState } from 'react';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, ErrorAlert, PageHeader, QueryState, StatusBadge } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatNumber } from '../../lib/format';
import { MaterialFormModal } from './components/MaterialFormModal';
import { useDeleteMaterial, useMaterials } from './materials.hooks';

function ruleText(m: MaterialDto): string {
  switch (m.category) {
    case 'SEQUENCE': {
      const parts = [`${formatNumber(m.seqPerCd)} seq/CD`, `${formatNumber(m.cdPerRoll)} CD/roll`];
      if (m.cdPerRound) parts.push(`${formatNumber(m.cdPerRound)} CD/round`);
      return parts.join(' · ');
    }
    case 'BEAD':
      return `${formatNumber(m.pcsPerKg)} pcs/KG`;
    case 'CORD':
      return `Denier ${formatNumber(m.denier)}`;
  }
}

const TONES = { SEQUENCE: 'blue', BEAD: 'amber', CORD: 'green' } as const;

export function MaterialsPage() {
  const auth = useAuth();
  const materials = useMaterials();
  const remove = useDeleteMaterial();
  const [editing, setEditing] = useState<MaterialDto | 'new' | null>(null);
  const canManage = auth.can('MATERIAL_MASTER_MANAGE');

  const onDelete = (m: MaterialDto) => {
    if (window.confirm(`Remove ${m.code}? Only possible while no design uses it.`)) remove.mutate(m.code);
  };

  const columns: Column<MaterialDto>[] = [
    { key: 'n', header: '#', align: 'right', width: '3rem', render: (_m, i) => i + 1 },
    { key: 'code', header: 'Material', render: (m) => <strong className="mono">{m.code}</strong> },
    { key: 'category', header: 'Category', render: (m) => <StatusBadge tone={TONES[m.category]}>{MATERIAL_CATEGORY_LABELS[m.category]}</StatusBadge> },
    { key: 'unit', header: 'Unit', render: (m) => m.unit },
    { key: 'rule', header: 'Conversion rule', render: (m) => <span className="small">{ruleText(m)}</span> },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <div className="row-actions">
          <button type="button" className="btn btn-sm" onClick={() => setEditing(m)}>
            Edit
          </button>
          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete(m)}>
            Remove
          </button>
        </div>
      ),
    });
  }

  return (
    <>
      <PageHeader
        title="Material Master"
        subtitle="These materials are the consumption columns everywhere (Punching, orders, purchase)."
        actions={
          canManage && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              + New material
            </button>
          )
        }
      />
      <ErrorAlert error={remove.error} />
      <QueryState query={materials}>
        {(list) => (
          <section className="card">
            <DataGrid
              columns={columns}
              rows={list}
              rowKey={(m) => m.code}
              empty={<EmptyState title="No materials yet.">{canManage ? 'Add your first material with “+ New material”.' : null}</EmptyState>}
            />
          </section>
        )}
      </QueryState>
      {editing !== null && <MaterialFormModal material={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
