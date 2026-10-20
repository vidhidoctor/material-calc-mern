import { useState } from 'react';
import { formatNumber } from '../lib/format';
import { NumberInput, parseNumberInput } from './ui';

interface Props {
  onUse: (denier: number) => void;
  /** "card": the cord popup's own section (open, larger); default: a small inline <details>. */
  variant?: 'inline' | 'card';
  /** Several cords: which one "Use this denier" fills. */
  targets?: { value: string; label: string }[];
  target?: string;
  onTargetChange?: (value: string) => void;
}

/** Denier = weight (grams) ÷ length (metres) × 9,000 — e.g. 5 g of 10 m yarn = 4,500 denier. */
export function DenierCalculator({ onUse, variant = 'inline', targets, target, onTargetChange }: Props) {
  const [metres, setMetres] = useState('');
  const [grams, setGrams] = useState('');
  const m = parseNumberInput(metres) ?? 0;
  const g = parseNumberInput(grams) ?? 0;
  const denier = m > 0 && g > 0 ? (g / m) * 9000 : null;
  const card = variant === 'card';

  return (
    <details className={card ? 'denier-calc denier-calc-card' : 'denier-calc'} open={card || undefined}>
      <summary>
        {card ? (
          <span>
            <strong className="denier-calc-title">Denier calculator</strong>
            <span className="muted small denier-calc-hint">Calculate denier from a known yarn length and weight, then use it above.</span>
          </span>
        ) : (
          'Denier calculator'
        )}
      </summary>
      <div className="denier-calc-row">
        <label>
          <span className={card ? 'cord-label' : 'muted small'}>Yarn length (metres)</span>
          <NumberInput decimal className={card ? 'input-lg' : 'input-sm'} value={metres} onChange={setMetres} placeholder="10" />
        </label>
        <label>
          <span className={card ? 'cord-label' : 'muted small'}>{card ? 'Yarn weight (grams)' : 'Weight (grams)'}</span>
          <NumberInput decimal className={card ? 'input-lg' : 'input-sm'} value={grams} onChange={setGrams} placeholder="5" />
        </label>
        <div className="denier-result">
          <span className="muted small">{card ? 'Calculated denier' : 'grams ÷ metres × 9,000'}</span>
          <strong>{denier === null ? '—' : `${formatNumber(denier, 2)} den`}</strong>
        </div>
        {targets && (
          <label>
            <span className={card ? 'cord-label' : 'muted small'}>For</span>
            <select className="input" value={target} onChange={(e) => onTargetChange?.(e.target.value)}>
              {targets.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={card ? 'btn btn-outline-primary btn-lg' : 'btn btn-sm'}
          disabled={denier === null}
          onClick={() => denier !== null && onUse(Number(denier.toFixed(4)))}
        >
          {card ? 'Use this denier' : 'Use this'}
        </button>
      </div>
      {(metres !== '' || grams !== '') && denier === null && <span className="muted small">Enter a length and a weight greater than 0.</span>}
    </details>
  );
}
