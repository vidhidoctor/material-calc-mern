import type { DesignListItemDto } from '@app/shared';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, PageHeader, QueryState } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { NewDesignModal } from './components/NewDesignModal';
import { useDesigns } from './punching.hooks';

const columns: Column<DesignListItemDto>[] = [
  {
    key: 'designNo',
    header: 'Design No.',
    render: (d) => (
      <Link className="strong-link" to={`/punching/${encodeURIComponent(d.designNo)}`}>
        {d.designNo}
      </Link>
    ),
  },
  { key: 'product', header: 'Product', render: (d) => d.productName },
  {
    key: 'components',
    header: 'Components',
    render: (d) =>
      d.components.length === 0 ? (
        <span className="muted small">No components yet</span>
      ) : (
        <div className="tags">
          {d.components.map((c) => (
            <span key={c.name} className="tag">
              {c.name} · {c.sizes.length}
            </span>
          ))}
        </div>
      ),
  },
  { key: 'created', header: 'Created', render: (d) => formatDate(d.createdAt) },
];

export function DesignsPage() {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const designs = useDesigns(q);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Punching Master"
        subtitle="Designs, their components and sizes, and the material one piece consumes."
        actions={
          auth.can('PUNCHING_CREATE') && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              + New design
            </button>
          )
        }
      />
      <section className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search design number (e.g. 2649 finds 26-49)"
            aria-label="Search design number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <QueryState query={designs}>
          {(list) => (
            <div className={designs.isFetching && designs.isPlaceholderData ? 'is-stale' : undefined}>
              <DataGrid
                columns={columns}
                rows={list}
                rowKey={(d) => d.designNo}
                empty={
                  <EmptyState title={q ? `No design matches “${q}”.` : 'No designs yet.'}>
                    {!q && auth.can('PUNCHING_CREATE') ? 'Create the first one with “+ New design”.' : null}
                  </EmptyState>
                }
              />
            </div>
          )}
        </QueryState>
      </section>
      {creating && <NewDesignModal onClose={() => setCreating(false)} />}
    </>
  );
}
