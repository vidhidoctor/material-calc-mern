// Pure calculation engine (docs/context.md §5). No Mongoose, no Express, no imports from modules/.
// Level 1: requirement = consumption × quantity. Level 2: each material category's own formula steps.
import { MESSAGES } from '@app/shared';
import { Decimal } from './decimal.js';
import { evaluateFormula, formulaNames, FormulaError, NAME_PATTERN, parseFormula, type FormulaNode } from './formula.js';

export { Decimal };

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

// ---- Level 2: category formulas ----

export interface CategoryField {
  key: string;
  label: string;
  required: boolean;
  /** Shown when a required value is missing; default: "Material conversion rule is not configured." */
  missingMessage?: string | null;
}

export interface CategoryStep {
  key: string;
  label: string;
  formula: string;
}

export interface CategoryRule {
  code: string;
  name: string;
  fields: readonly CategoryField[];
  steps: readonly CategoryStep[];
  /** Key of the step whose value is the quantity to purchase. */
  purchaseStep: string;
}

export interface CompiledCategory extends CategoryRule {
  compiled: { key: string; label: string; tree: FormulaNode }[];
}

/** The reserved name for the material's required quantity. */
export const TOTAL = 'TOTAL';

const upper = (value: string) => value.trim().toUpperCase();

/** Checks a category definition; returns readable problems (empty = valid). */
export function validateCategory(rule: CategoryRule): string[] {
  const problems: string[] = [];
  const known = new Set<string>([TOTAL]);

  for (const field of rule.fields) {
    const key = upper(field.key);
    if (!NAME_PATTERN.test(field.key)) problems.push(`Field “${field.key}”: use letters, numbers and _ only, starting with a letter.`);
    else if (key === TOTAL) problems.push('“TOTAL” is reserved for the required quantity; choose another field name.');
    else if (known.has(key)) problems.push(`Field “${field.key}” is listed twice.`);
    known.add(key);
  }

  if (rule.steps.length === 0) problems.push('Add at least one formula step.');
  for (const step of rule.steps) {
    const key = upper(step.key);
    if (!NAME_PATTERN.test(step.key)) {
      problems.push(`Step “${step.key}”: use letters, numbers and _ only, starting with a letter.`);
    } else if (key === TOTAL) {
      problems.push('“TOTAL” is reserved for the required quantity; choose another step name.');
    } else if (known.has(key)) {
      problems.push(`Step “${step.key}” uses a name that is already taken.`);
    }
    try {
      const names = formulaNames(parseFormula(step.formula));
      for (const name of names) {
        if (!known.has(name)) {
          problems.push(`Step ${step.key}: unknown name “${name}”. Use TOTAL, a field, or an earlier step.`);
        }
      }
    } catch (error) {
      problems.push(`Step ${step.key}: ${error instanceof Error ? error.message : 'invalid formula.'}`);
    }
    known.add(key);
  }

  if (!rule.steps.some((s) => upper(s.key) === upper(rule.purchaseStep))) {
    problems.push('Choose which step is the purchase quantity.');
  }
  return problems;
}

/** Parses the formulas once; throws FormulaError when the definition is invalid. */
export function compileCategory(rule: CategoryRule): CompiledCategory {
  const problems = validateCategory(rule);
  if (problems.length > 0) throw new FormulaError(problems[0]!);
  return { ...rule, compiled: rule.steps.map((s) => ({ key: upper(s.key), label: s.label, tree: parseFormula(s.formula) })) };
}

export interface ConversionResult {
  /** Every step's value (step key upper-case → value); null when it could not be calculated. */
  values: Map<string, Decimal> | null;
  purchase: Decimal | null;
  error?: string;
}

/**
 * Level 2: runs the category's steps for one material. Missing rule values and division by zero
 * are reported, never thrown.
 */
export function convertWithCategory(
  category: CompiledCategory,
  rules: Readonly<Record<string, number | null | undefined>>,
  total: Decimal,
): ConversionResult {
  const scope = new Map<string, Decimal>([[TOTAL, total]]);
  const byUpperKey = new Map(Object.entries(rules).map(([key, value]) => [upper(key), value]));

  for (const field of category.fields) {
    const value = byUpperKey.get(upper(field.key));
    if (typeof value === 'number' && value > 0) scope.set(upper(field.key), new Decimal(value));
    else if (field.required) {
      return { values: null, purchase: null, error: field.missingMessage || MESSAGES.CONVERSION_RULE_MISSING };
    }
  }

  const values = new Map<string, Decimal>();
  for (const step of category.compiled) {
    try {
      const value = evaluateFormula(step.tree, scope);
      values.set(step.key, value);
      scope.set(step.key, value);
    } catch (error) {
      // An optional field used in a formula but not filled in counts as a missing rule.
      const message = error instanceof FormulaError && error.message === 'Division by zero.' ? `${step.label}: division by zero.` : MESSAGES.CONVERSION_RULE_MISSING;
      return { values: null, purchase: null, error: message };
    }
  }
  return { values, purchase: values.get(upper(category.purchaseStep)) ?? null };
}

/** Transport format: plain decimal string, 6 decimal places max (display rounds to 2). */
export function toDecimalString(value: Decimal): string {
  return value.toDecimalPlaces(6).toString();
}
