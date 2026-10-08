// Pure calculation engine (docs/context.md §5). No Mongoose, no Express, no imports from modules/.
import { CORD_DIVISOR, MESSAGES, type MaterialCategory } from '@app/shared';
import { Decimal as DecimalBase } from 'decimal.js';

/** High precision, never exponent notation in strings; ROUND_HALF_UP. */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });
export type Decimal = InstanceType<typeof Decimal>;

export interface MaterialRule {
  code: string;
  name: string;
  category: MaterialCategory;
  seqPerCd?: number | null;
  cdPerRoll?: number | null;
  pcsPerKg?: number | null;
  denier?: number | null;
}

export interface CalcLine {
  component: string;
  size: string;
  quantity: number;
  /** Per-piece consumption (materialCode → qty); null when the design has no such component + size. */
  consumption: Readonly<Record<string, number>> | null;
  /** Prefix for error messages; defaults to "COMPONENT SIZE". */
  label?: string;
}

export interface RowRequirement {
  component: string;
  size: string;
  quantity: number;
  /** Only materials with a requirement > 0. */
  requirements: Map<string, Decimal>;
}

export interface RequirementResult {
  rows: RowRequirement[];
  /** Every material code, 0 when not required. */
  totals: Map<string, Decimal>;
  errors: string[];
}

export type Conversion =
  | { kind: 'SEQUENCE'; cds: Decimal; rolls: Decimal }
  | { kind: 'BEAD'; kg: Decimal }
  | { kind: 'CORD'; grams: Decimal; kg: Decimal };

export interface ConversionResult {
  purchase: Conversion | null;
  error?: string;
}

/** Level 1: row requirement = consumption × quantity; total = sum per material. */
export function calculateRequirements(lines: readonly CalcLine[], materialCodes: readonly string[]): RequirementResult {
  const totals = new Map<string, Decimal>(materialCodes.map((code) => [code, new Decimal(0)]));
  const rows: RowRequirement[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    const requirements = new Map<string, Decimal>();
    if (line.consumption === null) {
      errors.push(`${line.label ?? `${line.component} ${line.size}`}: ${MESSAGES.CONSUMPTION_MISSING}`);
    } else {
      for (const code of materialCodes) {
        const perPiece = line.consumption[code];
        if (!perPiece) continue;
        const required = new Decimal(perPiece).times(line.quantity);
        requirements.set(code, required);
        totals.set(code, (totals.get(code) ?? new Decimal(0)).plus(required));
      }
    }
    rows.push({ component: line.component, size: line.size, quantity: line.quantity, requirements });
  }

  return { rows, totals, errors };
}

const isPositive = (value: number | null | undefined): value is number => typeof value === 'number' && value > 0;

/** Level 2: purchase quantity by category. A missing rule is reported, never thrown. */
export function convertPurchase(material: MaterialRule, total: Decimal): ConversionResult {
  switch (material.category) {
    case 'SEQUENCE': {
      if (!isPositive(material.seqPerCd) || !isPositive(material.cdPerRoll)) {
        return { purchase: null, error: MESSAGES.CONVERSION_RULE_MISSING };
      }
      const cds = total.dividedBy(material.seqPerCd);
      return { purchase: { kind: 'SEQUENCE', cds, rolls: cds.dividedBy(material.cdPerRoll) } };
    }
    case 'BEAD': {
      if (!isPositive(material.pcsPerKg)) return { purchase: null, error: MESSAGES.CONVERSION_RULE_MISSING };
      return { purchase: { kind: 'BEAD', kg: total.dividedBy(material.pcsPerKg) } };
    }
    case 'CORD': {
      if (!isPositive(material.denier)) return { purchase: null, error: MESSAGES.CORD_DENIER_MISSING };
      const grams = total.times(material.denier).dividedBy(CORD_DIVISOR);
      return { purchase: { kind: 'CORD', grams, kg: grams.dividedBy(1000) } };
    }
  }
}

/** Transport format: plain decimal string, 6 decimal places max (display rounds to 2). */
export function toDecimalString(value: Decimal): string {
  return value.toDecimalPlaces(6).toString();
}
