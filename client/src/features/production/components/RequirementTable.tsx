import type { OrderSummaryDto, OrderSummaryRowDto } from '@app/shared';
import { Fragment, useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/format';

interface Group {
  component: string;
  rows: OrderSummaryRowDto[];
  quantity: number;
  /** materialCode → subtotal (display only; exact totals come from the API). */
  subtotals: Record<string, number>;
}

function groupByComponent(rows: OrderSummaryRowDto[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    let group = groups.get(row.component);
    if (!group) {
      group = { component: row.component, rows: [], quantity: 0, subtotals: {} };
      groups.set(row.component, group);
    }
    group.rows.push(row);
    group.quantity += row.quantity;
    for (const [code, value] of Object.entries(row.requirements)) {
      group.subtotals[code] = (group.subtotals[code] ?? 0) + Number(value);
    }
  }
  return [...groups.values()];
}

/**
 * Requirement per row, grouped by component: each component is a collapsible row showing its
 * subtotals in the material columns; expanding it shows one row per size.
 */
export function RequirementTable({ summary, totalPieces }: { summary: OrderSummaryDto; totalPieces: number }) {
  const used = summary.materials.filter((m) => summary.totals[m.code] !== undefined);
  const groups = useMemo(() => groupByComponent(summary.rows), [summary.rows]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.length === 1 ? [groups[0]!.component] : []));
  const allOpen = groups.every((g) => open.has(g.component));

  const toggle = (component: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(component)) next.delete(component);
      else next.add(component);
      return next;
    });

  const value = (v: number | string | undefined) => (v ? formatNumber(v) : <span className="muted">—</span>);

  return (
    <>
      <div className="table-tools">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.component)))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="table-wrap">
        <table className="table requirement-table">
          <thead>
            <tr>
              <th>Component / Size</th>
              <th className="align-right">Qty</th>
              {used.map((m) => (
                <th key={m.code} className="align-right" title={`${m.code} (${m.unit})`}>
                  {m.code}
                  <span className="th-unit">{m.unit}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const isOpen = open.has(group.component);
              return (
                <Fragment key={group.component}>
                  <tr className="req-group" onClick={() => toggle(group.component)}>
                    <td>
                      <button
                        type="button"
                        className="req-toggle"
                        aria-expanded={isOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(group.component);
                        }}
                      >
                        <span className={`chevron ${isOpen ? 'chevron-open' : ''}`} aria-hidden="true">
                          ▸
                        </span>
                        <strong>{group.component}</strong>
                        <span className="muted small">
                          · {group.rows.length} size{group.rows.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    </td>
                    <td className="align-right">
                      <strong>{formatNumber(group.quantity, 0)}</strong>
                    </td>
                    {used.map((m) => (
                      <td key={m.code} className="align-right">
                        <strong>{value(group.subtotals[m.code])}</strong>
                      </td>
                    ))}
                  </tr>
                  {isOpen &&
                    group.rows.map((row) => (
                      <tr key={row.size} className="req-size">
                        <td>{row.size}</td>
                        <td className="align-right">{formatNumber(row.quantity, 0)}</td>
                        {used.map((m) => (
                          <td key={m.code} className="align-right">
                            {value(row.requirements[m.code])}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="align-right">{formatNumber(totalPieces, 0)}</td>
              {used.map((m) => (
                <td key={m.code} className="align-right">
                  {formatNumber(summary.totals[m.code])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
