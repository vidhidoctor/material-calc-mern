import { MESSAGES } from '@app/shared';
import type { CategoryRule } from '../calculation/engine.js';

export interface DefaultCategory extends CategoryRule {
  unit: string;
  sortOrder: number;
  /** Step shown in the order details; null = the purchase step. */
  orderStep: string | null;
  wholeUnits: boolean;
}

/**
 * The three original categories with exactly the original formulas (docs/context.md §5).
 * Created when missing; afterwards Admin can edit them like any other category.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    code: 'SEQUENCE',
    name: 'Sequence',
    unit: 'PCS',
    sortOrder: 0,
    fields: [
      { key: 'seqPerCd', label: 'Sequence per CD', required: true },
      { key: 'cdPerRoll', label: 'CD per roll', required: true },
      { key: 'cdPerRound', label: 'CD per round', required: false },
    ],
    steps: [
      { key: 'CD', label: 'CD', formula: 'TOTAL / seqPerCd' },
      { key: 'ROLLS', label: 'Rolls', formula: 'CD / cdPerRoll' },
    ],
    purchaseStep: 'ROLLS',
    // Orders show sequences in whole CDs (the purchase department buys CDs).
    orderStep: 'CD',
    wholeUnits: true,
  },
  {
    code: 'BEAD',
    name: 'Beads & decorative',
    unit: 'PCS',
    sortOrder: 1,
    fields: [{ key: 'pcsPerKg', label: 'Pieces per KG', required: true }],
    steps: [{ key: 'KG', label: 'KG', formula: 'TOTAL / pcsPerKg' }],
    purchaseStep: 'KG',
    orderStep: null,
    wholeUnits: false,
  },
  {
    code: 'CORD',
    name: 'Cord',
    unit: 'MTR',
    sortOrder: 2,
    fields: [{ key: 'denier', label: 'Denier', required: true, missingMessage: MESSAGES.CORD_DENIER_MISSING }],
    steps: [
      { key: 'GRAMS', label: 'Grams', formula: 'TOTAL * denier / 9000' },
      { key: 'KG', label: 'KG', formula: 'GRAMS / 1000' },
    ],
    purchaseStep: 'KG',
    orderStep: null,
    wholeUnits: false,
  },
];

/** Old fixed rule fields → the default categories' field keys (used to migrate old materials). */
export const LEGACY_RULE_FIELDS = ['seqPerCd', 'cdPerRoll', 'cdPerRound', 'pcsPerKg', 'denier'] as const;

/** Builds a material's `rules` from the old fixed fields (e.g. fixture data). */
export function legacyRules(source: Partial<Record<(typeof LEGACY_RULE_FIELDS)[number], number | null>>): Record<string, number> {
  const rules: Record<string, number> = {};
  for (const key of LEGACY_RULE_FIELDS) {
    const value = source[key];
    if (typeof value === 'number') rules[key] = value;
  }
  return rules;
}
