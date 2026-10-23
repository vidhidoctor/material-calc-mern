import type { MaterialCategoryDto, MaterialDto } from '@app/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, ErrorAlert, PageHeader, QueryState, StatusBadge } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatNumber } from '../../lib/format';
import { CategoriesTab } from './components/CategoriesTab';
import { ComponentNamesTab } from './components/ComponentNamesTab';
import { MaterialFormModal } from './components/MaterialFormModal';
import { RatesTab } from './components/RatesTab';
import { useCategories, useDeleteMaterial, useMaterials } from './materials.hooks';

const TONES = ['blue', 'amber', 'green', 'grey'] as const;

/** e.g. "Sequence per CD 31,600 · CD per roll 210" from the category's field labels. */
function ruleText(m: MaterialDto, category: MaterialCategoryDto | undefined): string {
  if (!category) return Object.entries(m.rules).map(([k, v]) => `${k} ${formatNumber(v)}`).join(' · ');
  const parts = category.fields.filter((f) => m.rules[f.key] !== undefined).map((f) => `${f.label} ${formatNumber(m.rules[f.key])}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function MaterialsTab() {
  const auth = useAuth();
  const materials = useMaterials();
  const categories = useCategories();
  const remove = useDeleteMaterial();
  const [editing, setEditing] = useState<MaterialDto | 'new' | null>(null);
  const canManage = auth.can('MATERIAL_MASTER_MANAGE');
  const categoryList = categories.data ?? [];
  const byCode = new Map(categoryList.map((c, i) => [c.code, { category: c, tone: TONES[i % TONES.length]! }]));

  const onDelete = (m: MaterialDto) => {
    if (window.confirm(`Remove ${m.code}? Only possible while no design uses it.`)) remove.mutate(m.code);
  };

  const columns: Column<MaterialDto>[] = [
    { key: 'n', header: '#', align: 'right', width: '3rem', render: (_m, i) => i + 1 },
    { key: 'code', header: 'Material', render: (m) => <strong className="mono">{m.code}</strong> },
    {
      key: 'category',
      header: 'Category',
      render: (m) => <StatusBadge tone={byCode.get(m.category)?.tone ?? 'grey'}>{m.categoryName}</StatusBadge>,
    },
    { key: 'unit', header: 'Unit', render: (m) => m.unit },
    { key: 'rule', header: 'Conversion rule', render: (m) => <span className="small">{ruleText(m, byCode.get(m.category)?.category)}</span> },
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
      {canManage && (
        <div className="tab-actions">
          <button type="button" className="btn btn-primary" disabled={categoryList.length === 0} onClick={() => setEditing('new')}>
            + New material
          </button>
        </div>
      )}
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
      {editing !== null && (
        <MaterialFormModal material={editing === 'new' ? null : editing} categories={categoryList} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

type Tab = 'materials' | 'categories' | 'components' | 'rates';

export function MaterialsPage() {
  const auth = useAuth();
  const canCost = auth.can('COST_VIEW');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab =
    requested === 'categories' || requested === 'components' ? requested : requested === 'rates' && canCost ? 'rates' : 'materials';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'materials', label: 'Materials' },
    { id: 'categories', label: 'Categories' },
    { id: 'components', label: 'Components' },
    ...(canCost ? [{ id: 'rates' as const, label: 'Rates & costs' }] : []),
  ];

  return (
    <>
      <PageHeader title="Material Master" subtitle="Materials are the consumption columns everywhere; categories decide how purchase quantities are calculated." />
      <div className="segmented" role="tablist" aria-label="Material Master">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-pressed={tab === t.id}
            onClick={() => setParams(t.id === 'materials' ? {} : { tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'materials' ? <MaterialsTab /> : tab === 'categories' ? <CategoriesTab /> : tab === 'components' ? <ComponentNamesTab /> : <RatesTab />}
    </>
  );
}
