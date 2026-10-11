import { variantLabel, type OrderCostDto, type OrderSummaryDto, type OrderSummaryRowDto } from '@app/shared';
import { Fragment } from 'react';
import { formatMoney, formatNumber } from '../../../lib/format';

interface ComponentGroup {
  component: string;
  rows: OrderSummaryRowDto[];
  quantity: number;
  /** materialCode → subtotal for this component (display only). */
  subtotals: Record<string, number>;
}

function groupByComponent(rows: OrderSummaryRowDto[]): ComponentGroup[] {
  const groups: ComponentGroup[] = [];
  for (const row of rows) {
    let group = groups.at(-1);
    if (!group || group.component !== row.component) {
      group = { component: row.component, rows: [], quantity: 0, subtotals: {} };
      groups.push(group);
    }
    group.rows.push(row);
    group.quantity += row.quantity;
    for (const [code, value] of Object.entries(row.requirements)) {
      group.subtotals[code] = (group.subtotals[code] ?? 0) + Number(value);
    }
  }
  return groups;
}

/**
 * One clean table per order: Component (shown once) | Size | Qty | one column per material used,
 * and a total line under each component (no grand total).
 * Requirement = consumption per piece × quantity (from the API).
 */
/** `cost` (Admin only) adds a ₹ column: material cost per row and per component. */
export function OrderLinesTable({ summary, cost }: { summary: OrderSummaryDto; cost?: OrderCostDto }) {
  const used = summary.columns;
  const rowCost = new Map(cost?.rows.map((r) => [`${r.component}\u0000${r.size}`, r.cost]) ?? []);
  const componentCost = new Map(cost?.components.map((c) => [c.component, c.cost]) ?? []);
  const groups = groupByComponent(summary.rows);
  const cell = (value: number | string | undefined) => (value ? formatNumber(value) : <span className="muted">—</span>);

  return (
    <div className="table-wrap">
      <table className="table clean-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Size</th>
            <th className="align-right">Qty</th>
            {used.map((m) => (
              <th key={m.key} className="align-right" title={`${variantLabel(m.key)} (${m.unit})`}>
                {m.code}
                {m.color && <span className="th-unit">{m.color}</span>}
              </th>
            ))}
            {cost && <th className="align-right cost-col">Cost ₹</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, g) => (
            <Fragment key={group.component}>
              {group.rows.map((row, i) => (
                <tr key={row.size} className={i === 0 && g > 0 ? 'group-start' : undefined}>
                  <td>{i === 0 ? <strong>{group.component}</strong> : null}</td>
                  <td>{row.size}</td>
                  <td className="align-right">{formatNumber(row.quantity, 0)}</td>
                  {used.map((m) => (
                    <td key={m.key} className="align-right">
                      {cell(row.requirements[m.key])}
                    </td>
                  ))}
                  {cost && <td className="align-right cost-col">{formatMoney(rowCost.get(`${group.component}\u0000${row.size}`) ?? null)}</td>}
                </tr>
              ))}
              <tr className="subtotal-row">
                <td colSpan={2}>{group.component} total</td>
                <td className="align-right subtotal-qty">{formatNumber(group.quantity, 0)}</td>
                {used.map((m) => (
                  <td key={m.key} className="align-right">
                    {cell(group.subtotals[m.key])}
                  </td>
                ))}
                {cost && <td className="align-right cost-col subtotal-qty">{formatMoney(componentCost.get(group.component) ?? null)}</td>}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
