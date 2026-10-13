import { useState } from 'react';
import { formatNumber } from '../lib/format';
import { NumberInput, parseNumberInput } from './ui';

/** Denier = weight (grams) ÷ length (metres) × 9,000 — e.g. 5 g of 10 m yarn = 4,500 denier. */
export function DenierCalculator({ onUse }: { onUse: (denier: number) => void }) {
  const [metres, setMetres] = useState('');
  const [grams, setGrams] = useState('');
  const m = parseNumberInput(metres) ?? 0;
  const g = parseNumberInput(grams) ?? 0;
  const denier = m > 0 && g > 0 ? (g / m) * 9000 : null;

  return (
    <details className="denier-calc">
      <summary>Denier calculator</summary>
      <div className="denier-calc-row">
        <label>
          <span className="muted small">Yarn length (metres)</span>
          <NumberInput decimal className="input-sm" value={metres} onChange={setMetres} placeholder="10" />
        </label>
        <label>
          <span className="muted small">Weight (grams)</span>
          <NumberInput decimal className="input-sm" value={grams} onChange={setGrams} placeholder="5" />
        </label>
        <div className="denier-result">
          <span className="muted small">grams ÷ metres × 9,000</span>
          <strong>{denier === null ? '—' : `${formatNumber(denier, 2)} den`}</strong>
        </div>
        <button type="button" className="btn btn-sm" disabled={denier === null} onClick={() => denier !== null && onUse(Number(denier.toFixed(4)))}>
          Use this
        </button>
      </div>
      {(metres !== '' || grams !== '') && denier === null && <span className="muted small">Enter a length and a weight greater than 0.</span>}
    </details>
  );
}
