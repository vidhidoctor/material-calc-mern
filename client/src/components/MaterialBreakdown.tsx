import type { MaterialBreakdownDto } from '@app/shared';
import { useState } from 'react';
import { formatMoney, formatNumber } from '../lib/format';

/**
 * Material detail per category, like the cording sheet: material, component/size, quantity per piece,
 * the material's values (e.g. denier), each formula step per piece (e.g. grams, KG), and for an order
 * the target pieces, total purchase quantity and (Admin) rate and amount. One tab per category.
 */
export function MaterialBreakdown({ data, mode }: { data: MaterialBreakdownDto; mode: 'design' | 'order' }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (data.categories.length === 0) return <p className="muted small">No materials punched yet.</p>;
  const category = data.categories.find((c) => c.code === selected) ?? data.categories[0]!;
  const rows = data.rows.filter((r) => r.category === category.code);
  const purchase = category.steps.find((s) => s.key === category.purchaseStep);
  const showCost = mode === 'order' && rows.some((r) => r.amount !== null);
  const totalAmount = showCost ? rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0) : 0;
  const totalPurchase = mode === 'order' ? rows.reduce((sum, r) => sum + Number(r.totalSteps?.[category.purchaseStep] ?? 0), 0) : 0;

  return (
    <div className="stack">
      {data.categories.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Material category">
          {data.categories.map((c) => (
            <button key={c.code} type="button" role="tab" aria-selected={c.code === category.code} aria-pressed={c.code === category.code} onClick={() => setSelected(c.code)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="formula-list">
        {category.steps.map((s) => (
          <span key={s.key} className={`formula ${s.key === category.purchaseStep ? 'formula-purchase' : ''}`}>
            {s.key} = {s.formula}
          </span>
        ))}
      </div>
      <div className="table-wrap bordered">
        <table className="table clean-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Component / size</th>
              <th className="align-right">Req. {category.unit} / pc</th>
              {category.fields.map((f) => (
                <th key={f.key} className="align-right">
                  {f.label}
                </th>
              ))}
              {category.steps.map((s) => (
                <th key={s.key} className="align-right">
                  {s.label} / pc
                </th>
              ))}
              {mode === 'order' && <th className="align-right">Target pcs</th>}
              {mode === 'order' && <th className="align-right purchase-col">Total {purchase?.label ?? category.purchaseStep}</th>}
              {showCost && <th className="align-right">Rate / {purchase?.label ?? 'unit'}</th>}
              {showCost && <th className="align-right cost-col">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.component}|${r.size}|${r.key}`}>
                <td>
                  <strong className="mono">{r.code}</strong>
                  {r.color && <span className="badge badge-blue color-badge">{r.color}</span>}
                  {r.type && <span className="badge badge-amber color-badge">{r.type}</span>}
                </td>
                <td>
                  {r.component} · {r.size}
                </td>
                <td className="align-right">{formatNumber(r.perPiece, 4)}</td>
                {category.fields.map((f) => (
                  <td key={f.key} className="align-right muted">
                    {r.fields[f.key] === undefined ? '—' : formatNumber(r.fields[f.key])}
                  </td>
                ))}
                {category.steps.map((s) => (
                  <td key={s.key} className="align-right">
                    {r.perPieceSteps[s.key] === undefined ? <span className="rule-error">{r.error ?? '—'}</span> : formatNumber(r.perPieceSteps[s.key], 7)}
                  </td>
                ))}
                {mode === 'order' && <td className="align-right">{formatNumber(r.pieces, 0)}</td>}
                {mode === 'order' && <td className="align-right purchase-col">{formatNumber(r.totalSteps?.[category.purchaseStep], 4)}</td>}
                {showCost && <td className="align-right">{formatMoney(r.ratePerPurchaseUnit)}</td>}
                {showCost && <td className="align-right cost-col">{formatMoney(r.amount)}</td>}
              </tr>
            ))}
          </tbody>
          {mode === 'order' && (
            <tfoot>
              <tr>
                <td colSpan={3 + category.fields.length + category.steps.length + 1}>Total</td>
                <td className="align-right">{formatNumber(totalPurchase, 4)}</td>
                {showCost && <td />}
                {showCost && <td className="align-right">{formatMoney(totalAmount)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
