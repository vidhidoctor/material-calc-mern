import type { OrderSummaryDto } from '@app/shared';
import { formatNumber } from '../../../lib/format';

/**
 * One clean table per order: Component (shown once) | Size | Qty | one column per material used,
 * with a total line. Requirement = consumption per piece × quantity (from the API).
 */
export function OrderLinesTable({ summary, totalPieces }: { summary: OrderSummaryDto; totalPieces: number }) {
  const used = summary.materials.filter((m) => summary.totals[m.code] !== undefined);

  return (
    <div className="table-wrap">
      <table className="table clean-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Size</th>
            <th className="align-right">Qty</th>
            {used.map((m) => (
              <th key={m.code} className="align-right" title={`${m.code} (${m.unit})`}>
                {m.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row, i) => {
            const firstOfComponent = i === 0 || summary.rows[i - 1]!.component !== row.component;
            return (
              <tr key={`${row.component}|${row.size}`} className={firstOfComponent && i > 0 ? 'group-start' : undefined}>
                <td>{firstOfComponent ? <strong>{row.component}</strong> : null}</td>
                <td>{row.size}</td>
                <td className="align-right">{formatNumber(row.quantity, 0)}</td>
                {used.map((m) => {
                  const value = row.requirements[m.code];
                  return (
                    <td key={m.code} className="align-right">
                      {value ? formatNumber(value) : <span className="muted">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
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
  );
}
