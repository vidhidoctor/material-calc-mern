import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Decimal } from '../src/calculation/engine.js';
import { applyCordSheet } from '../src/db/rate-sheet.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';

const round = (value: string | null, places: number) => (value === null ? null : new Decimal(value).toDecimalPlaces(places).toFixed(places));

interface Row {
  code: string;
  component: string;
  size: string;
  fields: Record<string, number>;
  perPiece: string;
  perPieceSteps: Record<string, string>;
  pieces: number | null;
  totalSteps: Record<string, string> | null;
  ratePerPurchaseUnit: string | null;
  amount: string | null;
}

/** CORDING DENIER-MTR-WEIGHT DETAIL sheet: PC cord and Moti cord. */
describe('cord / yarn requirement and cost (cording sheet)', () => {
  let ctx: TestContext;
  let orderNo: number;
  const admin = () => bearer(ctx.adminToken);

  before(async () => {
    ctx = await startTestApp();
    const log = await applyCordSheet();
    assert.deepEqual(log, ['Material PC-CORD: created from the cording sheet', 'Material MOTI-CORD: created from the cording sheet']);
    await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'CD-1', productName: 'Lehenga' });
    await ctx.api.put('/api/designs/CD-1/components/KALI').set(admin()).send({ sizes: [{ size: '18', stitch: 1, consumption: { 'PC-CORD': 56 } }] });
    await ctx.api.put('/api/designs/CD-1/components/BLOUSE').set(admin()).send({ sizes: [{ size: '18', stitch: 1, consumption: { 'MOTI-CORD': 115 } }] });
    const order = await ctx.api
      .post('/api/orders')
      .set(admin())
      .send({ designNo: 'CD-1', party: 'CORD', lines: [{ component: 'KALI', size: '18', quantity: 230 }, { component: 'BLOUSE', size: '18', quantity: 460 }] });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    orderNo = order.body.orderNo;
  });
  after(async () => {
    await ctx.stop();
  });

  it('Punching: grams and KG per piece from metres × denier ÷ 9000', async () => {
    const res = await ctx.api.get('/api/designs/CD-1/breakdown').set(admin());
    assert.equal(res.status, 200);
    const pc = (res.body.rows as Row[]).find((r) => r.code === 'PC-CORD')!;
    assert.equal(pc.fields.denier, 1250);
    assert.equal(round(pc.perPieceSteps.GRAMS!, 4), '7.7778');
    assert.equal(round(pc.perPieceSteps.KG!, 7), '0.0077778');
    const moti = (res.body.rows as Row[]).find((r) => r.code === 'MOTI-CORD')!;
    assert.equal(round(moti.perPieceSteps.GRAMS!, 4), '23.6389');
    assert.deepEqual(res.body.categories.map((c: { code: string }) => c.code), ['CORD']);
  });

  it('Production (Admin): total KG × rate per KG = amount, per cord', async () => {
    const res = await ctx.api.get(`/api/orders/${orderNo}/breakdown`).set(admin());
    assert.equal(res.status, 200);
    const pc = (res.body.rows as Row[]).find((r) => r.code === 'PC-CORD')!;
    assert.equal(pc.pieces, 230);
    assert.equal(round(pc.totalSteps!.KG!, 4), '1.7889');
    assert.equal(round(pc.ratePerPurchaseUnit, 2), '550.00');
    assert.equal(round(pc.amount, 2), '983.89');
    const moti = (res.body.rows as Row[]).find((r) => r.code === 'MOTI-CORD')!;
    assert.equal(moti.pieces, 460);
    assert.equal(round(moti.totalSteps!.KG!, 4), '10.8739');
    assert.equal(round(moti.amount, 2), '5980.64');
  });

  it('Production employees see quantities but no ₹', async () => {
    const prod = await createActiveUser(ctx, { email: 'cord-prod@example.com', roleName: 'Production Employee' });
    const res = await ctx.api.get(`/api/orders/${orderNo}/breakdown`).set(bearer(prod.token));
    assert.equal(res.status, 200);
    const pc = (res.body.rows as Row[]).find((r) => r.code === 'PC-CORD')!;
    assert.equal(round(pc.totalSteps!.KG!, 4), '1.7889');
    assert.equal(pc.amount, null);
    assert.equal(pc.ratePerPurchaseUnit, null);
  });

  it('a new denier changes the weight; the order keeps its saved price per KG until re-priced', async () => {
    const edit = await ctx.api.put('/api/materials/PC-CORD').set(admin()).send({ category: 'CORD', rules: { denier: 4500 } });
    assert.equal(edit.status, 200);
    await ctx.api.put('/api/costing/rates/PC-CORD').set(admin()).send({ basicRate: 600, gstPercent: 0 });
    const res = await ctx.api.get(`/api/orders/${orderNo}/breakdown`).set(admin());
    const pc = (res.body.rows as Row[]).find((r) => r.code === 'PC-CORD')!;
    // 56 m × 4,500 ÷ 9,000 = 28 g per piece; × 230 = 6.44 KG
    assert.equal(round(pc.perPieceSteps.GRAMS!, 2), '28.00');
    assert.equal(round(pc.totalSteps!.KG!, 2), '6.44');
    // The order keeps its saved rate (₹550/KG, not the new ₹600) applied to the current weight: 6.44 KG × 550.
    assert.equal(round(pc.ratePerPurchaseUnit, 2), '550.00');
    assert.equal(round(pc.amount, 2), '3542.00');
    const cost = (await ctx.api.get(`/api/costing/orders/${orderNo}`).set(admin())).body;
    assert.equal(cost.usesCurrentRates, false);
    // Explicit re-pricing uses today's ₹600/KG.
    await ctx.api.post(`/api/costing/orders/${orderNo}/refresh-rates`).set(admin());
    const repriced = (await ctx.api.get(`/api/orders/${orderNo}/breakdown`).set(admin())).body.rows.find((r: Row) => r.code === 'PC-CORD');
    assert.equal(round(repriced.amount, 2), '3864.00');
    assert.deepEqual(await applyCordSheet(), []);
  });
});
