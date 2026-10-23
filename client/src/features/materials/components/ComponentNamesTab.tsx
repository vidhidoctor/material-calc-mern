import { useState } from 'react';
import { ErrorAlert, QueryState } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { useAddComponentName, useComponentNames, useDeleteComponentName } from '../materials.hooks';

/**
 * The components Punching can choose (KALI, BLOUSE …). Admin adds and removes names here; a name typed
 * under "Other…" in Punching is added automatically. Removing a name only hides it from the dropdown.
 */
export function ComponentNamesTab() {
  const auth = useAuth();
  const canManage = auth.can('MATERIAL_MASTER_MANAGE');
  const list = useComponentNames();
  const add = useAddComponentName();
  const remove = useDeleteComponentName();
  const [name, setName] = useState('');
  const trimmed = name.trim().toUpperCase();
  const exists = (list.data ?? []).some((c) => c.name === trimmed);

  const onAdd = () => {
    if (!trimmed || exists) return;
    add.mutate(trimmed, { onSuccess: () => setName('') });
  };

  const onRemove = (component: string, designCount: number) => {
    const note = designCount > 0 ? ` ${designCount} design${designCount === 1 ? '' : 's'} using it keep${designCount === 1 ? 's' : ''} it.` : '';
    if (window.confirm(`Remove ${component} from the component list? It will no longer be offered in Punching.${note}`)) remove.mutate(component);
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>Components</h2>
          <span className="muted small">Offered in Punching Master → Add component. Names typed under “Other…” are added here automatically.</span>
        </div>
      </header>
      <div className="section-body stack">
        <ErrorAlert error={add.error ?? remove.error} />
        {canManage && (
          <form
            className="material-picker-row add-column"
            onSubmit={(e) => {
              e.preventDefault();
              onAdd();
            }}
          >
            <input
              className={`input upper ${exists ? 'invalid' : ''}`}
              placeholder="New component, e.g. DUPATTA"
              aria-label="New component"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
            />
            <button type="submit" className="btn btn-primary" disabled={!trimmed || exists || add.isPending}>
              + Add component
            </button>
            {exists && <span className="muted small">Already in the list.</span>}
          </form>
        )}
        <QueryState query={list}>
          {(components) =>
            components.length === 0 ? (
              <p className="muted small">No components yet{canManage ? ' — add the first one above.' : '.'}</p>
            ) : (
              <div className="table-wrap">
                <table className="table clean-table component-names-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="align-right">Used in designs</th>
                      {canManage && <th aria-label="Remove" />}
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((c) => (
                      <tr key={c.name}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td className="align-right">{c.designCount > 0 ? c.designCount : <span className="muted">—</span>}</td>
                        {canManage && (
                          <td className="align-right">
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Remove ${c.name}`}
                              disabled={remove.isPending}
                              onClick={() => onRemove(c.name, c.designCount)}
                            >
                              ✕
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </QueryState>
      </div>
    </section>
  );
}
