import type { PurchaseCategoryDto, PurchaseTotalDto } from '@app/shared';
import { formatNumber } from '../../../lib/format';

/** e.g. "Sequence per CD 31,600 · CD per roll 210" — the material's rule values, shown under its code. */
function ruleText(category: PurchaseCategoryDto, row: PurchaseTotalDto): string {
  return category.fields
    .filter((f) => row.rules[f.key] !== undefined)
    .map((f) => `${f.label} ${formatNumber(row.rules[f.key])}`)
    .join(' · ');
}

/**
 * One section per category: Material | Required (unit) | each formula step; the purchase step is
 * emphasised, intermediate steps are muted. Formulas appear as small badges.
 */
export function CategorySection({ category, rows }: { category: PurchaseCategoryDto; rows: PurchaseTotalDto[] }) {
  const isPurchase = (key: string) => key === category.purchaseStep;

  return (
    <section className="card">
      <header className="card-header">
        <h2>{category.name}</h2>
        <div className="formulas">
          {category.steps.map((s) => (
            <span key={s.key} className={`formula ${isPurchase(s.key) ? 'formula-purchase' : ''}`}>
              {s.key} = {s.formula}
            </span>
          ))}
        </div>
      </header>
      <div className="table-wrap">
        <table className="table clean-table purchase-table">
          <thead>
            <tr>
              <th>Material</th>
              <th className="align-right">Required {category.unit}</th>
              {category.steps.map((s) => (
                <th key={s.key} className={`align-right ${isPurchase(s.key) ? 'purchase-col' : ''}`}>
                  {isPurchase(s.key) ? `Purchase · ${s.label}` : s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.code}>
                <td>
                  <strong>{m.code}</strong>
                  {ruleText(category, m) && <span className="sub-figure">{ruleText(category, m)}</span>}
                </td>
                <td className="align-right">{formatNumber(m.total)}</td>
                {m.values ? (
                  category.steps.map((s) => (
                    <td key={s.key} className={`align-right ${isPurchase(s.key) ? 'purchase-col' : 'muted'}`}>
                      {formatNumber(m.values![s.key])}
                    </td>
                  ))
                ) : (
                  <td colSpan={category.steps.length} className="align-right">
                    <span className="rule-error">{m.error}</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
