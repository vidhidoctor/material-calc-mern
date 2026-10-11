import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Decimal } from '../src/calculation/engine.js';
import { applyRateSheet } from '../src/db/rate-sheet.js';
import { bearer, startTestApp, type TestContext } from './helpers.js';

/** Rounded like the sheets (ROUND_HALF_UP). */
const round = (value: string | null, places: number) => (value === null ? null : new Decimal(value).toDecimalPlaces(places).toFixed(places));

/** "BADHI J SEQ NO … 1 PC (1 SEQ NO RATE)" — the sequence rate sheet, row = size, column = type. */
const SEQUENCE_SHEET: Record<string, Record<string, string>> = {
  'PURE GLASS': { 'SEQ-3MM': '0.00127', 'SEQ-4MM': '0.00215', 'SEQ-7MM': '0.00620', 'SEQ-9MM': '0.01143' },
  'COLOR GLASS': { 'SEQ-3MM': '0.00150', 'SEQ-4MM': '0.00255', 'SEQ-7MM': '0.00736', 'SEQ-9MM': '0.01357' },
  OPQ: { 'SEQ-3MM': '0.00040', 'SEQ-4MM': '0.00067', 'SEQ-7MM': '0.00194', 'SEQ-9MM': '0.00357' },
  METAL: { 'SEQ-3MM': '0.00040', 'SEQ-4MM': '0.00067', 'SEQ-7MM': '0.00194', 'SEQ-9MM': '0.00357' },
  MATT: { 'SEQ-3MM': '0.00040', 'SEQ-4MM': '0.00067', 'SEQ-7MM': '0.00194', 'SEQ-9MM': '0.00357' },
  SPARKLE: { 'SEQ-3MM': '0.00079', 'SEQ-4MM': '0.00134', 'SEQ-7MM': '0.00387', 'SEQ-9MM': '0.00714' },
};

/** "KHATLI ALL MATERIAL 1 PC RATE WITH GST": 1 KG rate incl. GST and rate per piece. */
const BEAD_SHEET: Record<string, { incl: string; perPiece: string }> = {
  '2-MM-BEAD': { incl: '1008', perPiece: '0.013' },
  '2.5-MM-BEAD': { incl: '728', perPiece: '0.010' },
  '3-MM-MOTI': { incl: '1232', perPiece: '0.027' },
  '4-MM-PIPE': { incl: '672', perPiece: '0.019' },
  '7-MM-ZARDOSHI': { incl: '3920', perPiece: '0.087' },
};

describe('business rate sheet (loaded once, editable, calculations match the sheets)', () => {
  let ctx: TestContext;
  const admin = () => bearer(ctx.adminToken);
  const typeRates = async () => (await ctx.api.get('/api/costing/type-rates').set(admin())).body as {
    type: string;
    rateInclGst: string;
    perMaterial: { code: string; costPerUnit: string | null }[];
  }[];
  const rates = async () => (await ctx.api.get('/api/costing/rates').set(admin())).body as { key: string; rateInclGst: string; costPerUnit: string }[];

  before(async () => {
    ctx = await startTestApp();
    // A material entered earlier under another code is matched, not duplicated.
    const existing = await ctx.api.post('/api/materials').set(admin()).send({ code: '2.5-MM-BEAD', category: 'BEAD', rules: { pcsPerKg: 65000 } });
    assert.equal(existing.status, 201);
    const log = await applyRateSheet();
    assert.ok(log.some((l) => l === 'Material 2.5-MM-BEAD: updated from the rate sheet'));
  });
  after(async () => {
    await ctx.stop();
  });

  it('every sequence cell matches the sheet (type rate incl. 5% GST ÷ CD per roll ÷ seq per CD)', async () => {
    const rows = await typeRates();
    assert.deepEqual(
      rows.map((r) => [r.type, r.rateInclGst]),
      [['PURE GLASS', '8400'], ['COLOR GLASS', '9975'], ['OPQ', '2625'], ['METAL', '2625'], ['MATT', '2625'], ['SPARKLE', '5250']],
    );
    for (const row of rows) {
      for (const [code, expected] of Object.entries(SEQUENCE_SHEET[row.type]!)) {
        const cell = row.perMaterial.find((m) => m.code === code)!;
        assert.equal(round(cell.costPerUnit, 5), expected, `${row.type} ${code}`);
      }
    }
  });

  it('every bead row matches the sheet (rate incl. 12% GST ÷ pieces per KG)', async () => {
    const list = await rates();
    for (const [code, expected] of Object.entries(BEAD_SHEET)) {
      const row = list.find((r) => r.key === code)!;
      assert.ok(row, code);
      assert.equal(row.rateInclGst, expected.incl, code);
      assert.equal(round(row.costPerUnit, 3), expected.perPiece, code);
      assert.equal((row as unknown as { fields: { key: string; value: number }[] }).fields[0]!.key, 'pcsPerKg');
    }
    // Sequences are priced by type, not per material.
    assert.equal(list.some((r) => r.key.startsWith('SEQ-')), false);
  });

  it('is applied once; edits made afterwards are kept and recalculated', async () => {
    assert.deepEqual(await applyRateSheet(), []);

    await ctx.api.put('/api/costing/type-rates/SEQUENCE/MATT').set(admin()).send({ basicRate: 3000, gstPercent: 5 });
    await ctx.api.put('/api/costing/rates/2-MM-BEAD').set(admin()).send({ basicRate: 1000, gstPercent: 12 });
    assert.deepEqual(await applyRateSheet(), []);

    const matt = (await typeRates()).find((r) => r.type === 'MATT')!;
    assert.equal(matt.rateInclGst, '3150');
    assert.equal(round(matt.perMaterial.find((m) => m.code === 'SEQ-3MM')!.costPerUnit, 5), '0.00047'); // 3150 ÷ 6,636,000
    assert.equal((await rates()).find((r) => r.key === '2-MM-BEAD')!.costPerUnit, '0.014'); // 1120 ÷ 80,000

    // Editing a material's conversion (pieces per KG) changes its cost per piece.
    const edited = await ctx.api.put('/api/materials/2-MM-BEAD').set(admin()).send({ category: 'BEAD', rules: { pcsPerKg: 70000 } });
    assert.equal(edited.status, 200);
    assert.equal(round((await rates()).find((r) => r.key === '2-MM-BEAD')!.costPerUnit, 4), '0.0160'); // 1120 ÷ 70,000
  });

  it('--force re-applies the sheet values', async () => {
    const log = await applyRateSheet({ force: true });
    assert.ok(log.length > 0);
    assert.equal((await typeRates()).find((r) => r.type === 'MATT')!.rateInclGst, '2625');
    assert.equal((await rates()).find((r) => r.key === '2-MM-BEAD')!.costPerUnit, '0.0126');
  });

  it('an order costs sequences at its chosen type rate and beads at their rate', async () => {
    await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'RS-1', productName: 'Blouse' });
    const put = await ctx.api
      .put('/api/designs/RS-1/components/KALI')
      .set(admin())
      .send({ sizes: [{ size: '18', stitch: 1, consumption: { 'SEQ-3MM|PINK': 1000, '2-MM-BEAD': 500 } }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const order = await ctx.api
      .post('/api/orders')
      .set(admin())
      .send({ designNo: 'RS-1', party: 'SHEET', quantity: 100, types: { 'SEQ-3MM|PINK': 'PURE GLASS' } });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const cost = (await ctx.api.get(`/api/costing/orders/${order.body.orderNo}`).set(admin())).body;
    // 100 pcs × (1000 × 8400/6,636,000 + 500 × 1008/80,000)
    const expected = new Decimal(100).times(new Decimal(1000).times(8400).dividedBy(6636000).plus(new Decimal(500).times(1008).dividedBy(80000)));
    assert.equal(round(cost.total, 2), expected.toDecimalPlaces(2).toFixed(2));
  });
});
