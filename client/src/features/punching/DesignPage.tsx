import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { EmptyState, ErrorAlert, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { ComponentCard } from '../../components/ComponentCard';
import { ComponentEditor } from './components/ComponentEditor';
import { EditDesignModal } from './components/EditDesignModal';
import { MaterialBreakdown } from '../../components/MaterialBreakdown';
import { useDeleteComponent, useDeleteDesign, useDesign, useDesignBreakdown, useDesignCost } from './punching.hooks';

export function DesignPage() {
  const designNo = useParams().designNo ?? '';
  const auth = useAuth();
  const design = useDesign(designNo);
  const cost = useDesignCost(designNo, auth.can('COST_VIEW'));
  const remove = useDeleteComponent(designNo);
  const removeDesign = useDeleteDesign();
  const navigate = useNavigate();
  // ?component=new | <NAME> opens the editor (survives refresh; "New design" lands here with =new).
  const [params, setParams] = useSearchParams();
  const editing = params.get('component');
  const [renaming, setRenaming] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const breakdown = useDesignBreakdown(designNo, showWeights);

  const canEditComponents = auth.can('PUNCHING_CREATE', 'PUNCHING_UPDATE');
  const canUpdate = auth.can('PUNCHING_UPDATE');

  const openEditor = (name: string) => setParams({ component: name });
  const closeEditor = () => setParams({}, { replace: true });

  const onRemove = (name: string) => {
    if (window.confirm(`Remove ${name} and all its sizes from design ${designNo}?`)) remove.mutate(name);
  };

  const onDeleteDesign = () => {
    if (window.confirm(`Delete design ${designNo} with all its components? This cannot be undone.`)) {
      removeDesign.mutate(designNo, { onSuccess: () => navigate('/punching', { replace: true }) });
    }
  };

  return (
    <>
      <Link to="/punching" className="back-link">
        ← Punching Master
      </Link>
      <QueryState query={design}>
        {(d) => (
          <>
            <PageHeader
              title={`Design ${d.designNo}`}
              subtitle={
                <>
                  <strong>{d.productName}</strong> · created {formatDate(d.createdAt)}
                </>
              }
              actions={
                <>
                  {canUpdate && (
                    <>
                      <button type="button" className="btn btn-danger-ghost" disabled={removeDesign.isPending} onClick={onDeleteDesign}>
                        Delete design
                      </button>
                      <button type="button" className="btn" onClick={() => setRenaming(true)}>
                        Edit design
                      </button>
                    </>
                  )}
                  {canEditComponents && d.components.length > 0 && (
                    <button type="button" className="btn btn-primary" onClick={() => openEditor('new')}>
                      + Add component
                    </button>
                  )}
                </>
              }
            />
            <ErrorAlert error={remove.error ?? removeDesign.error} />
            {cost.data && cost.data.errors.length > 0 && (
              <div className="alert alert-info">
                <strong>Cost is incomplete:</strong>
                <ul>
                  {cost.data.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {d.components.length === 0 ? (
              <section className="card">
                <EmptyState title="No components yet.">
                  {canEditComponents ? (
                    <button type="button" className="btn btn-primary" onClick={() => openEditor('new')}>
                      + Add component
                    </button>
                  ) : (
                    'Someone with Punching access needs to add components.'
                  )}
                </EmptyState>
              </section>
            ) : (
              <>
                {d.components.map((component) => (
                  <ComponentCard
                    key={component.name}
                    component={component}
                    materials={d.materials}
                    onEdit={canEditComponents ? () => openEditor(component.name) : undefined}
                    onRemove={canUpdate ? () => onRemove(component.name) : undefined}
                    removing={remove.isPending}
                    costs={cost.data?.components.find((c) => c.name === component.name)?.sizes}
                  />
                ))}
              </>
            )}

            {d.components.length > 0 && (
              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Per-piece weight &amp; conversion</h2>
                    <span className="muted small">Worked out from what you punched, e.g. cord grams per piece = metres × denier ÷ 9000.</span>
                  </div>
                  <button type="button" className="btn btn-sm" aria-expanded={showWeights} onClick={() => setShowWeights((s) => !s)}>
                    {showWeights ? 'Hide' : 'Show'}
                  </button>
                </header>
                {showWeights && <div className="section-body">{breakdown.data ? <MaterialBreakdown data={breakdown.data} mode="design" /> : null}</div>}
              </section>
            )}

            {editing && canEditComponents && (
              <ComponentEditor
                key={editing}
                design={d}
                componentName={editing === 'new' ? null : editing}
                onClose={closeEditor}
              />
            )}
            {renaming && <EditDesignModal designNo={d.designNo} productName={d.productName} onClose={() => setRenaming(false)} />}
          </>
        )}
      </QueryState>
    </>
  );
}
