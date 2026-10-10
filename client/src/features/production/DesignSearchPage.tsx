import type { ProductionDesignListItemDto } from '@app/shared';
import { useDeferredValue, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { DataGrid, type Column } from '../../components/DataGrid';
import { EmptyState, PageHeader, QueryState } from '../../components/ui';
import { formatNumber } from '../../lib/format';
import { useProductionDesigns } from './production.hooks';

const designUrl = (designNo: string) => `/production/${encodeURIComponent(designNo)}`;

const columns: Column<ProductionDesignListItemDto>[] = [
  {
    key: 'designNo',
    header: 'Design No.',
    render: (d) => (
      <Link className="strong-link" to={designUrl(d.designNo)}>
        {d.designNo}
      </Link>
    ),
  },
  { key: 'product', header: 'Product', render: (d) => d.productName },
  {
    key: 'components',
    header: 'Components',
    render: (d) => (
      <div className="tags">
        {d.components.map((c) => (
          <span key={c.name} className="tag">
            {c.name} · {c.sizes.length}
          </span>
        ))}
      </div>
    ),
  },
  { key: 'rows', header: 'Rows', align: 'right', render: (d) => formatNumber(d.entries, 0) },
  { key: 'orders', header: 'Previous orders', align: 'right', render: (d) => formatNumber(d.orders, 0) },
  {
    key: 'open',
    header: '',
    align: 'right',
    render: (d) => (
      <Link className="btn btn-sm" to={designUrl(d.designNo)}>
        Open
      </Link>
    ),
  },
];

/** Production's home: find a design (only designs with at least one component). */
export function DesignSearchPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const designs = useProductionDesigns(q);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && designs.data?.length === 1 && !designs.isPlaceholderData) {
      navigate(designUrl(designs.data[0]!.designNo));
    }
  };

  return (
    <>
      <PageHeader title="Design search" subtitle="Find a design to see its previous orders or create a new order." />
      <section className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            autoFocus
            placeholder="Design number (e.g. 2649) — Enter opens a single match"
            aria-label="Search design number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onKeyDown}
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
                  <EmptyState title={q ? `No design matches “${q}”.` : 'No designs with components yet.'}>
                    {q ? null : 'Designs appear here once Punching has added at least one component.'}
                  </EmptyState>
                }
              />
            </div>
          )}
        </QueryState>
      </section>
    </>
  );
}
