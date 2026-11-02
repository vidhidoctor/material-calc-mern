import type { DesignCostingListItemDto } from '@app/shared';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, PageHeader, QueryState, StatusBadge } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useDesignCostings } from './design-costing.hooks';

const costingUrl = (designNo: string) => `/design-costing/${encodeURIComponent(designNo)}`;

export function DesignCostingListPage() {
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const designs = useDesignCostings(q);

  const columns: Column<DesignCostingListItemDto>[] = [
    {
      key: 'designNo',
      header: 'Design No.',
      render: (d) => (
        <Link className="strong-link" to={costingUrl(d.designNo)}>
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
    {
      key: 'costing',
      header: 'Costing',
      render: (d) =>
        d.savedAt ? (
          <span title={d.savedBy ?? undefined}>
            <StatusBadge tone="green">Saved</StatusBadge> <span className="muted small">{formatDate(d.savedAt)}</span>
          </span>
        ) : (
          <StatusBadge tone="grey">Not costed</StatusBadge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <Link className="btn btn-sm" to={costingUrl(d.designNo)}>
          Open
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Design Costing" subtitle="Review punching details, enter stitch and laser rates, and set the markup of every design." />
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
                empty={<EmptyState title={q ? `No design matches “${q}”.` : 'No designs yet.'}>{q ? null : 'Designs entered in the Punching Master appear here.'}</EmptyState>}
              />
            </div>
          )}
        </QueryState>
      </section>
    </>
  );
}
