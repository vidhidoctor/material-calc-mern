import { MESSAGES } from '@app/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateRequirements,
  compileCategory,
  convertWithCategory,
  Decimal,
  unitCost,
  validateCategory,
  type CalcLine,
  type CompiledCategory,
} from '../src/calculation/engine.js';
import { DEFAULT_CATEGORIES, legacyRules } from '../src/db/default-categories.js';
import { fixture } from './fixture.js';

const categories = new Map<string, CompiledCategory>(DEFAULT_CATEGORIES.map((c) => [c.code, compileCategory(c)]));
const materials = fixture.materials.map((m) => ({ code: m.code, category: m.category, rules: legacyRules(m) }));
const codes = materials.map((m) => m.code);

/** Fixture keys (cds, rolls, kg, grams) → step keys of the default categories. */
const STEP_KEY: Record<string, string> = { cds: 'CD', rolls: 'ROLLS', kg: 'KG', grams: 'GRAMS' };

function fixtureLines(): CalcLine[] {
  const index = new Map<string, Record<string, number>>();
  for (const c of fixture.design.components) for (const s of c.sizes) index.set(`${c.name} ${s.size}`, s.consumption);
  return fixture.order.lines.map((line) => ({ ...line, consumption: index.get(`${line.component} ${line.size}`) ?? null }));
}

describe('calculation engine (fixture 26-49, default categories)', () => {
  const result = calculateRequirements(fixtureLines(), codes);
  const convert = (code: string) => {
    const m = materials.find((x) => x.code === code)!;
    return convertWithCategory(categories.get(m.category)!, m.rules, result.totals.get(code)!);
  };

  it('has 37 rows and no errors', () => {
    assert.equal(result.rows.length, 37);
    assert.deepEqual(result.errors, []);
  });

  it('reproduces every Level 1 total exactly', () => {
    for (const [code, expected] of Object.entries(fixture.expected.totals)) {
      assert.ok(result.totals.get(code)?.equals(expected), `${code}: ${result.totals.get(code)} ≠ ${expected}`);
    }
  });

  it('reproduces every rounded Level 2 value through the category formulas', () => {
    for (const m of materials) {
      const { values, error } = convert(m.code);
      assert.equal(error, undefined, m.code);
      const expected = fixture.expected.purchase[m.code]!;
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(values!.get(STEP_KEY[key]!)!.toDecimalPlaces(2).toNumber(), value, `${m.code}.${key}`);
      }
    }
  });

  it('matches the headline figures from context §5', () => {
    assert.equal(convert('SEQ-3MM').values!.get('CD')!.toDecimalPlaces(2).toString(), '280.43');
    assert.equal(convert('SEQ-3MM').purchase!.toDecimalPlaces(2).toString(), '1.34');
    assert.equal(convert('BEAD-2.5MM').purchase!.toDecimalPlaces(2).toString(), '21.94');
    assert.equal(convert('CORD').purchase!.toDecimalPlaces(2).toString(), '38.56');
  });

  it('computes row requirement = consumption × quantity', () => {
    const kali18 = result.rows[0]!;
    assert.equal(kali18.component, 'KALI');
    assert.equal(kali18.requirements.get('SEQ-3MM')?.toString(), String(975 * 230));
    assert.equal(kali18.requirements.has('SEQ-7MM'), false);
  });

  it('avoids floating-point drift (0.1 × 3 = 0.3)', () => {
    const r = calculateRequirements([{ component: 'A', size: '1', quantity: 3, consumption: { CORD: 0.1 } }], ['CORD']);
    assert.equal(r.totals.get('CORD')?.toString(), '0.3');
  });

  it('reports a missing consumption row instead of crashing', () => {
    const r = calculateRequirements([{ component: 'FROCK', size: '18', quantity: 5, consumption: null }], codes);
    assert.deepEqual(r.errors, [`FROCK 18: ${MESSAGES.CONSUMPTION_MISSING}`]);
    assert.ok(r.totals.get('SEQ-3MM')?.isZero());
  });

  it('reports missing rule values (FRD messages), never throws', () => {
    const total = new Decimal(1000);
    assert.equal(convertWithCategory(categories.get('SEQUENCE')!, { seqPerCd: 100 }, total).error, MESSAGES.CONVERSION_RULE_MISSING);
    assert.equal(convertWithCategory(categories.get('BEAD')!, { pcsPerKg: 0 }, total).error, MESSAGES.CONVERSION_RULE_MISSING);
    assert.equal(convertWithCategory(categories.get('CORD')!, {}, total).error, MESSAGES.CORD_DENIER_MISSING);
  });
});

describe('unit cost (rate incl. GST → cost per piece/metre)', () => {
  it('matches the KHATLI rate sheet (2 MM bead, 2.5 MM bead, 3 MM moti, pipe, zardoshi)', () => {
    const bead = categories.get('BEAD')!;
    const rows: [number, number, string, string][] = [
      // basic ₹/KG, pcs/KG, rate incl. 12% GST, cost per piece (rounded to 3 like the sheet)
      [900, 80000, '1008', '0.013'],
      [650, 70000, '728', '0.010'],
      [1100, 45000, '1232', '0.027'],
      [600, 35000, '672', '0.019'],
      [3500, 45000, '3920', '0.087'],
    ];
    for (const [basic, pcsPerKg, incl, perPiece] of rows) {
      const r = unitCost(bead, { pcsPerKg }, basic, 12);
      assert.equal(r.rateInclGst.toString(), incl);
      assert.equal(r.perUnit!.toDecimalPlaces(3).toFixed(3), perPiece, `${basic}/${pcsPerKg}`);
    }
    // No premature rounding: ₹1,008 ÷ 80,000 is exactly 0.0126.
    assert.equal(unitCost(bead, { pcsPerKg: 80000 }, 900, 12).perUnit!.toString(), '0.0126');
  });

  it('works for rolls (sequence) and metres (cord) through their formulas', () => {
    // ₹2,000 per roll, 31,600 seq/CD, 210 CD/roll → per sequence = 2,000 ÷ 6,636,000
    const seq = unitCost(categories.get('SEQUENCE')!, { seqPerCd: 31600, cdPerRoll: 210 }, 2000, 0);
    assert.equal(seq.perUnit!.toDecimalPlaces(8).toString(), '0.00030139');
    // Cord ₹500/KG + 5%: 1 MTR × 1200 denier ÷ 9000 ÷ 1000 KG × ₹525
    const cord = unitCost(categories.get('CORD')!, { denier: 1200 }, 500, 5);
    assert.equal(cord.perUnit!.toDecimalPlaces(8).toString(), '0.07');
  });

  it('reports a missing conversion rule instead of a cost', () => {
    const r = unitCost(categories.get('BEAD')!, {}, 900, 12);
    assert.equal(r.perUnit, null);
    assert.equal(r.error, MESSAGES.CONVERSION_RULE_MISSING);
  });
});

describe('custom category formulas', () => {
  const zardoshi = compileCategory({
    code: 'ZARDOSHI',
    name: 'Zardoshi',
    fields: [
      { key: 'pcsPerKg', label: 'Pieces per KG', required: true },
      { key: 'wastage', label: 'Wastage %', required: false },
    ],
    steps: [
      { key: 'KG', label: 'KG', formula: 'TOTAL / pcsPerKg' },
      { key: 'WITH_WASTAGE', label: 'KG + wastage', formula: 'KG * (1 + wastage / 100)' },
    ],
    purchaseStep: 'WITH_WASTAGE',
  });

  it('runs steps in order, later steps using earlier ones (names are case-insensitive)', () => {
    const r = convertWithCategory(zardoshi, { PCSPERKG: 45000, wastage: 10 }, new Decimal(90000));
    assert.equal(r.values!.get('KG')!.toString(), '2');
    assert.equal(r.purchase!.toString(), '2.2');
  });

  it('an optional field used in a formula but not filled in is a missing rule', () => {
    assert.equal(convertWithCategory(zardoshi, { pcsPerKg: 45000 }, new Decimal(9)).error, MESSAGES.CONVERSION_RULE_MISSING);
  });

  it('division by zero is reported', () => {
    const c = compileCategory({ code: 'X', name: 'X', fields: [], steps: [{ key: 'A', label: 'A', formula: 'TOTAL / (2 - 2)' }], purchaseStep: 'A' });
    assert.equal(convertWithCategory(c, {}, new Decimal(5)).error, 'A: division by zero.');
  });

  it('validates definitions with readable messages', () => {
    const base = { code: 'X', name: 'X', fields: [{ key: 'rate', label: 'Rate', required: true }], purchaseStep: 'B' };
    assert.deepEqual(validateCategory({ ...base, steps: [{ key: 'B', label: 'B', formula: 'TOTAL / rate' }] }), []);
    assert.match(validateCategory({ ...base, steps: [{ key: 'B', label: 'B', formula: 'TOTAL / rat' }] })[0]!, /unknown name “RAT”/);
    assert.match(validateCategory({ ...base, steps: [{ key: 'B', label: 'B', formula: 'C + 1' }, { key: 'C', label: 'C', formula: '1' }] })[0]!, /unknown name “C”/);
    assert.match(validateCategory({ ...base, steps: [{ key: 'B', label: 'B', formula: 'TOTAL / (rate' }] })[0]!, /bracket is not closed/);
    assert.match(validateCategory({ ...base, steps: [{ key: 'B', label: 'B', formula: 'TOTAL ^ 2' }] })[0]!, /Unexpected “\^”/);
    assert.match(validateCategory({ ...base, steps: [{ key: 'TOTAL', label: 'T', formula: '1' }], purchaseStep: 'TOTAL' })[0]!, /reserved/);
    assert.match(validateCategory({ ...base, steps: [{ key: 'A', label: 'A', formula: '1' }] })[0]!, /purchase quantity/);
    assert.match(validateCategory({ ...base, steps: [] })[0]!, /at least one/);
  });
});
