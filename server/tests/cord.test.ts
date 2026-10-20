import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Decimal } from '../src/calculation/engine.js';
import { copyCordValuesToOrders, removeCordMasterValues } from '../src/db/migrations.js';
import { applyCordSheet } from '../src/db/rate-sheet.js';
import { MaterialRateModel } from '../src/modules/costing/material-rate.model.js';
import { MaterialModel } from '../src/modules/materials/material.model.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';

const round = (value: string | null, places: number) => (value === null ? null : new Decimal(value).toDecimalPlaces(places).toFixed(places));

interface Row {
  code: string;
  component: string;
  fields: Record<string, number>;
  perPieceSteps: Record<string, string>;
  pieces: number | null;
  totalSteps: Record<string, string> | null;
  ratePerPurchaseUnit: string | null;
  amount: string | null;
  error?: string;
}

/**
 * Cord: Material Master keeps only the material "Cord"; each order gets its own denier and rate per KG
 * (incl. GST). Weight = metres × denier ÷ 9,000,000 KG; cost = weight × rate (cording sheet values).
 */
describe('cord: denier and rate per order', () => {
  let ctx: TestContext;
  let orderA: number;
  let orderB: number;
  const admin = () => bearer(ctx.adminToken);

  before(async () => {
    ctx = await startTestApp();
    assert.deepEqual(await applyCordSheet(), ['Material CORD: created (denier and rate are entered on each order)']);
    await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'CD-1', productName: 'Lehenga' });
    await ctx.api.put('/api/designs/CD-1/components/KALI').set(admin()).send({ sizes: [{ size: '18', stitch: 1, consumption: { CORD: 56 } }] });
    const create = async (party: string, quantity: number) => {
      const res = await ctx.api.post('/api/orders').set(admin()).send({ designNo: 'CD-1', party, quantity });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.orderNo as number;
    };
    orderA = await create('PC', 230);
    orderB = await create('MOTI', 460);
  });
  after(async () => {
    await ctx.stop();
  });

  it('Material Master: only the material Cord, no denier, no rate', async () => {
    const material = (await ctx.api.get('/api/materials').set(admin())).body.find((m: { code: string }) => m.code === 'CORD');
    assert.deepEqual([material.name, material.category, material.rules], ['Cord', 'CORD', {}]);
    // A denier sent for a cord is not kept; cords are not priced in Rates & costs.
    const put = await ctx.api.put('/api/materials/CORD').set(admin()).send({ name: 'Cord', category: 'CORD', rules: { denier: 1250 } });
    assert.deepEqual(put.body.rules, {});
    const rates = (await ctx.api.get('/api/costing/rates').set(admin())).body;
    assert.equal(rates.some((r: { key: string }) => r.key === 'CORD'), false);
  });

  it('Punching shows the metres per piece; the weight is worked out on each order', async () => {
    const res = await ctx.api.get('/api/designs/CD-1/breakdown').set(admin());
    const row = (res.body.rows as Row[]).find((r) => r.code === 'CORD')!;
    assert.deepEqual(row.perPieceSteps, {});
    assert.match(row.error!, /denier entered on the order/);
  });

  it('each order has its own denier and rate: weight and cost (cording sheet: PC 1,250 D, Moti 1,850 D, ₹550/KG)', async () => {
    const save = (orderNo: number, denier: number, ratePerUnit: number) =>
      ctx.api.put(`/api/orders/${orderNo}/cords`).set(admin()).send({ cords: { CORD: { denier, ratePerUnit } } });
    const a = await save(orderA, 1250, 550);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await save(orderB, 1850, 550);
    assert.equal(b.status, 200, JSON.stringify(b.body));

    // A: 56 m × 230 = 12,880 m × 1,250 ÷ 9,000,000 = 1.7889 KG × ₹550 = ₹983.89
    assert.equal(round(a.body.buy.CORD, 4), '1.7889');
    assert.equal(round(a.body.columns[0].cord.cost, 2), '983.89');
    // B: 56 m × 460 = 25,760 m × 1,850 ÷ 9,000,000 = 5.2951 KG × ₹550 = ₹2,912.31
    assert.equal(round(b.body.buy.CORD, 4), '5.2951');
    assert.equal(round(b.body.columns[0].cord.cost, 2), '2912.31');

    // Component detail (Admin): order rate and amount.
    const rows = (await ctx.api.get(`/api/orders/${orderA}/breakdown`).set(admin())).body.rows as Row[];
    assert.equal(rows[0]!.fields.denier, 1250);
    assert.equal(round(rows[0]!.totalSteps!.KG!, 4), '1.7889');
    assert.equal(round(rows[0]!.ratePerPurchaseUnit, 2), '550.00');
    assert.equal(round(rows[0]!.amount, 2), '983.89');

    // The order's material cost includes the cord.
    const cost = (await ctx.api.get(`/api/costing/orders/${orderA}`).set(admin())).body;
    assert.equal(round(cost.total, 2), '983.89');
    assert.deepEqual(cost.errors, []);

    // Procurement: each order weighed with its own denier, then summed: 1.7889 + 5.2951 = 7.0840 KG.
    const purchase = (await ctx.api.get('/api/purchase/requirements').set(admin())).body;
    const cord = purchase.totals.find((t: { key: string }) => t.key === 'CORD');
    assert.equal(round(cord.purchase, 4), '7.0840');
    assert.equal(cord.total, '38640');
  });

  it('Production employees enter the denier and see weight, never ₹', async () => {
    const prod = await createActiveUser(ctx, { email: 'cord-prod@example.com', roleName: 'Production Employee' });
    const rate = await ctx.api.put(`/api/orders/${orderA}/cords`).set(bearer(prod.token)).send({ cords: { CORD: { ratePerUnit: 600 } } });
    assert.equal(rate.status, 403);
    const denier = await ctx.api.put(`/api/orders/${orderA}/cords`).set(bearer(prod.token)).send({ cords: { CORD: { denier: 4500 } } });
    assert.equal(denier.status, 200);
    // 12,880 m × 4,500 ÷ 9,000,000 = 6.44 KG; the rate (₹550) stays, hidden from Production.
    assert.equal(round(denier.body.buy.CORD, 2), '6.44');
    assert.deepEqual(denier.body.columns[0].cord, { denier: 4500, ratePerUnit: null, cost: null, rateUnit: 'KG' });
    const rows = (await ctx.api.get(`/api/orders/${orderA}/breakdown`).set(bearer(prod.token))).body.rows as Row[];
    assert.equal(rows[0]!.amount, null);
    // Admin: 6.44 KG × ₹550 = ₹3,542.00
    const cost = (await ctx.api.get(`/api/costing/orders/${orderA}`).set(admin())).body;
    assert.equal(round(cost.total, 2), '3542.00');
  });

  it('an order without denier or rate reports it instead of a wrong cost', async () => {
    await ctx.api.put(`/api/orders/${orderB}/cords`).set(admin()).send({ cords: { CORD: { ratePerUnit: null } } });
    const cost = (await ctx.api.get(`/api/costing/orders/${orderB}`).set(admin())).body;
    assert.equal(cost.total, '0');
    assert.deepEqual(cost.errors, ['CORD: enter the denier and rate per KG for this order.']);
  });

  it('upgrade: existing orders keep their cord weight and cost; then Material Master is cleared', async () => {
    // An order from before this change: denier and rate only in Material Master (₹500 + 10% GST = ₹550/KG).
    await MaterialModel.collection.updateOne({ code: 'CORD' }, { $set: { 'rules.denier': 1250 } });
    await MaterialRateModel.create({ key: 'CORD', basicRate: 500, gstPercent: 10, updatedAt: new Date(), updatedBy: 'test' });
    const old = await ctx.api.post('/api/orders').set(admin()).send({ designNo: 'CD-1', party: 'OLD', quantity: 230 });
    assert.equal(old.status, 201, JSON.stringify(old.body));

    // Start-up: copy onto orders that never had cord values (only this one), then clear Material Master.
    assert.equal(await copyCordValuesToOrders(), 1);
    assert.equal(await removeCordMasterValues(), 2);
    assert.deepEqual((await MaterialModel.findOne({ code: 'CORD' }))!.rules, {});
    assert.equal(await MaterialRateModel.countDocuments({ key: 'CORD' }), 0);

    // Same weight and cost as before: 12,880 m × 1,250 ÷ 9,000,000 = 1.7889 KG × ₹550 = ₹983.89.
    const summary = (await ctx.api.get(`/api/orders/${old.body.orderNo}/summary`).set(admin())).body;
    assert.equal(summary.columns[0].cord.denier, 1250);
    assert.equal(round(summary.columns[0].cord.ratePerUnit, 2), '550.00');
    assert.equal(round(summary.columns[0].cord.cost, 2), '983.89');
    const cost = (await ctx.api.get(`/api/costing/orders/${old.body.orderNo}`).set(admin())).body;
    assert.equal(round(cost.total, 2), '983.89');

    // Orders with their own cord values were not touched (order B's rate was cleared on purpose above).
    const b = (await ctx.api.get(`/api/orders/${orderB}/summary`).set(admin())).body;
    assert.deepEqual([b.columns[0].cord.denier, b.columns[0].cord.ratePerUnit], [1850, null]);

    // Running again changes nothing.
    assert.equal(await copyCordValuesToOrders(), 0);
    assert.equal(await removeCordMasterValues(), 0);
    assert.deepEqual(await applyCordSheet(), []);
  });
});
