import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';
import { loadFixture, round2 } from './fixture.js';

const round = (value: string, places: number) => Number(Number(value).toFixed(places));

describe('material costing (₹, Admin only)', () => {
  let ctx: TestContext;
  const admin = () => bearer(ctx.adminToken);

  before(async () => {
    ctx = await startTestApp();
    await loadFixture(ctx.api, ctx.adminToken);
    // A design using 2 MM bead A (1,000 per piece) and 3 MM sequence in two colours.
    await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'BL-102', productName: 'Blouse' });
    const put = await ctx.api
      .put('/api/designs/BL-102/components/KALI')
      .set(admin())
      .send({ sizes: [{ size: '18', stitch: 1, consumption: { 'BEAD-2MM-A': 1000, 'SEQ-3MM|WHITE': 200, 'SEQ-3MM|RED': 100 } }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
  });
  after(async () => {
    await ctx.stop();
  });

  it('only users with COST_VIEW (Admin) can see or set rates and costs', async () => {
    const prod = await createActiveUser(ctx, { email: 'prod-cost@example.com', roleName: 'Production Employee' });
    assert.equal((await ctx.api.get('/api/costing/rates').set(bearer(prod.token))).status, 403);
    assert.equal((await ctx.api.put('/api/costing/rates/BEAD-2MM-A').set(bearer(prod.token)).send({ basicRate: 1, gstPercent: 0 })).status, 403);
    assert.equal((await ctx.api.get('/api/costing/designs/BL-102').set(bearer(prod.token))).status, 403);
    const me = await ctx.api.get('/api/auth/me').set(admin());
    assert.ok(me.body.permissions.includes('COST_VIEW'));
  });

  it('works out rate incl. GST and cost per piece (rate sheet: 2 MM bead ₹900 + 12%, 80,000/KG)', async () => {
    const res = await ctx.api.put('/api/costing/rates/BEAD-2MM-A').set(admin()).send({ basicRate: 900, gstPercent: 12 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const bead = res.body.find((r: { key: string }) => r.key === 'BEAD-2MM-A');
    assert.equal(bead.rateInclGst, '1008');
    assert.equal(bead.costPerUnit, '0.0126');
    assert.equal(bead.purchaseUnit, 'KG');
    assert.equal(bead.unit, 'PCS');
  });

  it('lists colours used in designs; a colour uses its material rate unless it has its own', async () => {
    await ctx.api.put('/api/costing/rates/SEQ-3MM').set(admin()).send({ basicRate: 2100, gstPercent: 0 });
    let rates = (await ctx.api.get('/api/costing/rates').set(admin())).body as { key: string; inherited: boolean; costPerUnit: string | null }[];
    const white = rates.find((r) => r.key === 'SEQ-3MM|WHITE')!;
    assert.equal(white.inherited, true);
    // ₹2,100 per roll ÷ (31,600 × 210) sequences
    assert.equal(round(white.costPerUnit!, 8), round(String(2100 / (31600 * 210)), 8));

    const red = await ctx.api.put('/api/costing/rates/SEQ-3MM%7CRED').set(admin()).send({ basicRate: 4200, gstPercent: 0 });
    assert.equal(red.status, 200);
    rates = red.body;
    const redRow = rates.find((r) => r.key === 'SEQ-3MM|RED')!;
    assert.equal(redRow.inherited, false);
    assert.equal(round(redRow.costPerUnit!, 8), round(String(4200 / (31600 * 210)), 8));
    assert.equal((await ctx.api.put('/api/costing/rates/NOPE').set(admin()).send({ basicRate: 1, gstPercent: 0 })).status, 404);
    assert.equal((await ctx.api.put('/api/costing/rates/SEQ-3MM').set(admin()).send({ basicRate: -1, gstPercent: 0 })).status, 400);
  });

  it('design cost per piece = Σ quantity × cost per unit', async () => {
    const res = await ctx.api.get('/api/costing/designs/BL-102').set(admin());
    assert.equal(res.status, 200);
    const size = res.body.components[0].sizes[0];
    assert.equal(size.costs['BEAD-2MM-A'], '12.6'); // 1,000 × ₹0.0126
    const expected = 12.6 + (200 * 2100) / (31600 * 210) + (100 * 4200) / (31600 * 210);
    assert.equal(round2(size.total), Number(expected.toFixed(2)));
  });

  it('an order keeps the rates it was created with; later rate changes do not change it', async () => {
    const order = await ctx.api.post('/api/orders').set(admin()).send({ designNo: 'BL-102', party: 'COST', quantity: 100 });
    assert.equal(order.status, 201);
    const before = (await ctx.api.get(`/api/costing/orders/${order.body.orderNo}`).set(admin())).body;
    assert.equal(before.usesCurrentRates, false);
    assert.equal(round2(before.components[0].cost), round2(String(Number(before.rows[0].cost))));

    await ctx.api.put('/api/costing/rates/BEAD-2MM-A').set(admin()).send({ basicRate: 1000, gstPercent: 12 });
    const after = (await ctx.api.get(`/api/costing/orders/${order.body.orderNo}`).set(admin())).body;
    assert.equal(after.total, before.total);
    // The design shows today's rate: 1,000 × (1,120 ÷ 80,000) = ₹14.
    const design = (await ctx.api.get('/api/costing/designs/BL-102').set(admin())).body;
    assert.equal(design.components[0].sizes[0].costs['BEAD-2MM-A'], '14');
  });

  it('reports materials without a rate instead of failing', async () => {
    await ctx.api.put('/api/designs/BL-102/components/BELT').set(admin()).send({ sizes: [{ size: 'ALL', stitch: 1, consumption: { CORD: 2 } }] });
    const res = await ctx.api.get('/api/costing/designs/BL-102').set(admin());
    assert.ok(res.body.errors.some((e: string) => e.startsWith('CORD: no rate set')));
    assert.equal(res.body.unitCosts.CORD, null);
  });
});
