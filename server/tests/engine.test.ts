import { MESSAGES } from '@app/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateRequirements, convertPurchase, Decimal, type CalcLine, type MaterialRule } from '../src/calculation/engine.js';
import { fixture } from './fixture.js';

const materials = fixture.materials as unknown as MaterialRule[];
const codes = materials.map((m) => m.code);

function fixtureLines(): CalcLine[] {
  const index = new Map<string, Record<string, number>>();
  for (const c of fixture.design.components) for (const s of c.sizes) index.set(`${c.name} ${s.size}`, s.consumption);
  return fixture.order.lines.map((line) => ({ ...line, consumption: index.get(`${line.component} ${line.size}`) ?? null }));
}

describe('calculation engine (fixture 26-49)', () => {
  const result = calculateRequirements(fixtureLines(), codes);

  it('has 37 rows and no errors', () => {
    assert.equal(result.rows.length, 37);
    assert.deepEqual(result.errors, []);
  });

  it('reproduces every Level 1 total exactly', () => {
    for (const [code, expected] of Object.entries(fixture.expected.totals)) {
      assert.ok(result.totals.get(code)?.equals(expected), `${code}: ${result.totals.get(code)} ≠ ${expected}`);
    }
  });

  it('reproduces every rounded Level 2 purchase value', () => {
    for (const material of materials) {
      const { purchase, error } = convertPurchase(material, result.totals.get(material.code)!);
      assert.equal(error, undefined);
      assert.ok(purchase);
      const expected = fixture.expected.purchase[material.code]!;
      const got = Object.fromEntries(
        Object.entries(purchase).filter(([k]) => k !== 'kind').map(([k, v]) => [k, (v as Decimal).toDecimalPlaces(2).toNumber()]),
      );
      assert.deepEqual(got, expected, material.code);
    }
  });

  it('matches the headline figures from context §5', () => {
    const seq = convertPurchase(materials.find((m) => m.code === 'SEQ-3MM')!, result.totals.get('SEQ-3MM')!).purchase;
    assert.equal(seq?.kind, 'SEQUENCE');
    if (seq?.kind === 'SEQUENCE') {
      assert.equal(seq.cds.toDecimalPlaces(2).toString(), '280.43');
      assert.equal(seq.rolls.toDecimalPlaces(2).toString(), '1.34');
    }
    const cord = convertPurchase(materials.find((m) => m.code === 'CORD')!, result.totals.get('CORD')!).purchase;
    assert.equal(cord?.kind === 'CORD' && cord.kg.toDecimalPlaces(2).toString(), '38.56');
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

  it('reports missing conversion rules', () => {
    const total = new Decimal(1000);
    assert.equal(convertPurchase({ code: 'S', name: 'S', category: 'SEQUENCE', seqPerCd: 100 }, total).error, MESSAGES.CONVERSION_RULE_MISSING);
    assert.equal(convertPurchase({ code: 'B', name: 'B', category: 'BEAD', pcsPerKg: 0 }, total).error, MESSAGES.CONVERSION_RULE_MISSING);
    assert.equal(convertPurchase({ code: 'C', name: 'C', category: 'CORD', denier: null }, total).error, MESSAGES.CORD_DENIER_MISSING);
  });
});
