import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { EmptyState, ErrorAlert, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { ComponentCard } from '../../components/ComponentCard';
import { ComponentEditor } from './components/ComponentEditor';
import { EditDesignModal } from './components/EditDesignModal';
import { useDeleteComponent, useDeleteDesign, useDesign } from './punching.hooks';

export function DesignPage() {
  const designNo = useParams().designNo ?? '';
  const auth = useAuth();
  const design = useDesign(designNo);
  const remove = useDeleteComponent(designNo);
  const removeDesign = useDeleteDesign();
  const navigate = useNavigate();
  // ?component=new | <NAME> opens the editor (survives refresh; "New design" lands here with =new).
  const [params, setParams] = useSearchParams();
  const editing = params.get('component');
  const [renaming, setRenaming] = useState(false);

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
                  />
                ))}
              </>
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
