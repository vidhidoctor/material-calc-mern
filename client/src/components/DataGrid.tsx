import type { ReactNode } from 'react';
import { EmptyState } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  /** Numbers are right-aligned with tabular figures. */
  align?: 'left' | 'right' | 'center';
  width?: string;
}

interface DataGridProps<T> {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  footer?: ReactNode;
}

/** A table that scrolls inside its card (never the page) with a sticky header. */
export function DataGrid<T>({ columns, rows, rowKey, empty, rowClassName, footer }: DataGridProps<T>) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align ? `align-${c.align}` : undefined} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row)} className={rowClassName?.(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align ? `align-${c.align}` : undefined}>
                  {c.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
