import { CORD_DIVISOR, type PurchaseTotalDto } from '@app/shared';
import type { ReactNode } from 'react';
import { formatNumber } from '../../../lib/format';

function Section({ title, formulas, children }: { title: string; formulas: string[]; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>{title}</h2>
        <div className="formulas">
          {formulas.map((f) => (
            <span key={f} className="formula">
              {f}
            </span>
          ))}
        </div>
      </header>
      <div className="table-wrap">
        <table className="table clean-table purchase-table">{children}</table>
      </div>
    </section>
  );
}

/** Shown instead of a purchase figure when the material has no conversion rule. */
const RuleError = ({ message }: { message: string }) => <span className="rule-error">{message}</span>;

export function SequenceSection({ rows }: { rows: PurchaseTotalDto[] }) {
  return (
    <Section title="Sequence Material Requirements" formulas={['CD = PCS ÷ Seq per CD', 'Rolls = CD ÷ CD per roll']}>
      <thead>
        <tr>
          <th>Material</th>
          <th className="align-right">Required PCS</th>
          <th className="align-right">CD</th>
          <th className="align-right purchase-col">Purchase · Rolls</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.code}>
            <td>
              <strong>{m.code}</strong>
            </td>
            <td className="align-right">{formatNumber(m.total)}</td>
            {m.purchase?.kind === 'SEQUENCE' ? (
              <>
                <td className="align-right muted">{formatNumber(m.purchase.cds)}</td>
                <td className="align-right purchase-col">{formatNumber(m.purchase.rolls)}</td>
              </>
            ) : (
              <td colSpan={2} className="align-right">
                <RuleError message={m.error ?? ''} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Section>
  );
}

export function BeadSection({ rows }: { rows: PurchaseTotalDto[] }) {
  return (
    <Section title="Beads & Decorative Materials" formulas={['KG = PCS ÷ Pieces per KG']}>
      <thead>
        <tr>
          <th>Material</th>
          <th className="align-right">Required PCS</th>
          <th className="align-right purchase-col">Purchase · KG</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.code}>
            <td>
              <strong>{m.code}</strong>
            </td>
            <td className="align-right">{formatNumber(m.total)}</td>
            <td className="align-right purchase-col">
              {m.purchase?.kind === 'BEAD' ? formatNumber(m.purchase.kg) : <RuleError message={m.error ?? ''} />}
            </td>
          </tr>
        ))}
      </tbody>
    </Section>
  );
}

/** Denier read back from the API figures: grams × 9000 ÷ MTR. */
function denierOf(m: PurchaseTotalDto): number | null {
  if (m.purchase?.kind !== 'CORD' || Number(m.total) === 0) return null;
  return (Number(m.purchase.grams) * CORD_DIVISOR) / Number(m.total);
}

export function CordSection({ rows }: { rows: PurchaseTotalDto[] }) {
  return (
    <Section title="Cord Requirement" formulas={[`grams = MTR × Denier ÷ ${CORD_DIVISOR}`, 'KG = grams ÷ 1000']}>
      <thead>
        <tr>
          <th>Material</th>
          <th className="align-right">Total MTR</th>
          <th className="align-right">Denier</th>
          <th className="align-right purchase-col">Purchase quantity · KG</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => {
          const denier = denierOf(m);
          return (
            <tr key={m.code}>
              <td>
                <strong>{m.code}</strong>
              </td>
              <td className="align-right">{formatNumber(m.total)}</td>
              <td className="align-right muted">{denier === null ? '—' : formatNumber(denier, 0)}</td>
              <td className="align-right purchase-col">
                {m.purchase?.kind === 'CORD' ? (
                  <>
                    {formatNumber(m.purchase.kg)}
                    <span className="sub-figure">{formatNumber(m.purchase.grams)} g</span>
                  </>
                ) : (
                  <RuleError message={m.error ?? ''} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Section>
  );
}
