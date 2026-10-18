import type { MaterialCategoryDto } from '@app/shared';
import { useState } from 'react';
import { EmptyState, ErrorAlert, QueryState } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { useCategories, useDeleteCategory } from '../materials.hooks';
import { CategoryFormModal } from './CategoryFormModal';

/** Categories with their fields and formula steps; Admin can add, edit and remove them. */
export function CategoriesTab() {
  const auth = useAuth();
  const categories = useCategories();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState<MaterialCategoryDto | 'new' | null>(null);
  const canManage = auth.can('MATERIAL_MASTER_MANAGE');

  const onDelete = (c: MaterialCategoryDto) => {
    if (window.confirm(`Remove category ${c.name}? Only possible while no material uses it.`)) remove.mutate(c.code);
  };

  return (
    <>
      {canManage && (
        <div className="tab-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            + New category
          </button>
        </div>
      )}
      <ErrorAlert error={remove.error} />
      <QueryState query={categories}>
        {(list) =>
          list.length === 0 ? (
            <section className="card">
              <EmptyState title="No categories yet." />
            </section>
          ) : (
            <div className="category-grid">
              {list.map((c) => (
                <section key={c.code} className="card category-card">
                  <header className="card-header">
                    <div>
                      <h2>{c.name}</h2>
                      <span className="muted small">
                        <span className="mono">{c.code}</span> · unit {c.unit} · {c.materialCount} material{c.materialCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    {canManage && (
                      <div className="row-actions">
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(c)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-sm btn-danger-ghost" disabled={remove.isPending} onClick={() => onDelete(c)}>
                          Remove
                        </button>
                      </div>
                    )}
                  </header>
                  <div className="category-body">
                    <div>
                      <div className="category-label">Fields</div>
                      {c.fields.length === 0 ? (
                        <span className="muted small">None</span>
                      ) : (
                        <div className="tags">
                          {c.fields.map((f) => (
                            <span key={f.key} className="tag" title={f.required ? 'Required' : 'Optional'}>
                              {f.label} <span className="mono muted">({f.key})</span>
                              {f.required ? '' : ' · optional'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {c.types.length > 0 && (
                      <div>
                        <div className="category-label">Types (chosen per order)</div>
                        <div className="tags">
                          {c.types.map((t) => (
                            <span key={t} className="tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="category-label">Formula</div>
                      <ol className="steps">
                        {c.steps.map((s) => (
                          <li key={s.key} className={s.key === c.purchaseStep ? 'step-purchase' : undefined}>
                            <span className="mono">
                              {s.key} = {s.formula}
                            </span>
                            {s.key === c.purchaseStep && <span className="badge badge-blue">Purchase</span>}
                            {s.key === (c.orderStep ?? c.purchaseStep) && (
                              <span className="badge">Orders{c.wholeUnits ? ' · whole units' : ''}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )
        }
      </QueryState>
      {editing !== null && <CategoryFormModal category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
