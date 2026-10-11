import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bearer, startTestApp, type TestContext } from './helpers.js';
import { loadFixture, round2 } from './fixture.js';

/**
 * Sequence types (finish) chosen per order: Admin defines types + their rates, Punching enters
 * size + colour + quantity, Production picks the type for each colour in every order.
 */
describe('material types chosen per order (sequence finish)', () => {
  let ctx: TestContext;
  const admin = () => bearer(ctx.adminToken);

  before(async () => {
    ctx = await startTestApp();
    await loadFixture(ctx.api, ctx.adminToken);
    // Admin adds the types to the Sequence category (rest of the category unchanged).
    const sequence = (await ctx.api.get('/api/material-categories').set(admin())).body.find((c: { code: string }) => c.code === 'SEQUENCE');
    const { code: _code, materialCount: _count, sortOrder: _sort, ...body } = sequence;
    const res = await ctx.api
      .put('/api/material-categories/SEQUENCE')
      .set(admin())
      .send({ ...body, types: ['pure glass', 'Color Glass', 'MATT', 'METAL'] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.types, ['PURE GLASS', 'COLOR GLASS', 'MATT', 'METAL']);
    await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'SQ-1', productName: 'Blouse' });
  });
  after(async () => {
    await ctx.stop();
  });

  it('Punching must give a colour to sequence columns (the type is not decided there)', async () => {
    const noColour = await ctx.api
      .put('/api/designs/SQ-1/components/BLOUSE')
      .set(admin())
      .send({ sizes: [{ size: '18', stitch: 1, consumption: { 'SEQ-3MM': 100 } }] });
    assert.equal(noColour.status, 400);
    assert.equal(noColour.body.error, 'SEQ-3MM needs a colour (the Sequence type is chosen per order in Production).');

    const ok = await ctx.api
      .put('/api/designs/SQ-1/components/BLOUSE')
      .set(admin())
      .send({ sizes: [{ size: '18', stitch: 1, consumption: { 'SEQ-3MM|PINK': 100, 'SEQ-4MM|WHITE': 50, 'BEAD-2MM-A': 10 } }] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const columns = (await ctx.api.get('/api/designs/SQ-1').set(admin())).body.materials;
    assert.equal(columns.find((m: { code: string }) => m.code === 'SEQ-3MM').typed, true);
    assert.equal(columns.find((m: { code: string }) => m.code === 'BEAD-2MM-A').typed, false);
  });

  it('an order must choose a known type for each sequence colour it uses', async () => {
    const post = (types: Record<string, string>) =>
      ctx.api.post('/api/orders').set(admin()).send({ designNo: 'SQ-1', party: 'ABC', quantity: 1000, types });
    const none = await post({});
    assert.equal(none.status, 400);
    assert.equal(none.body.error, 'Choose a Sequence type for SEQ-3MM · PINK.');
    const unknown = await post({ 'SEQ-3MM|PINK': 'GOLD', 'SEQ-4MM|WHITE': 'MATT' });
    assert.equal(unknown.body.error, 'GOLD is not a Sequence type. Add it in Material Master → Categories.');

    const matt = await post({ 'seq-3mm|pink': 'matt', 'SEQ-4MM|WHITE': 'PURE GLASS' });
    assert.equal(matt.status, 201, JSON.stringify(matt.body));
    assert.deepEqual(matt.body.types, { 'SEQ-3MM|PINK': 'MATT', 'SEQ-4MM|WHITE': 'PURE GLASS' });

    // The same design, another order, another type.
    const glass = await post({ 'SEQ-3MM|PINK': 'PURE GLASS', 'SEQ-4MM|WHITE': 'PURE GLASS' });
    assert.equal(glass.status, 201);
    assert.equal(glass.body.types['SEQ-3MM|PINK'], 'PURE GLASS');
  });

  it('purchase keeps each type separate (MATT PINK vs PURE GLASS PINK)', async () => {
    const res = await ctx.api.get('/api/purchase/requirements').set(admin());
    const rows = res.body.totals as { key: string; type: string | null; total: string }[];
    assert.equal(rows.find((r) => r.key === 'SEQ-3MM|PINK^MATT')!.total, '100000');
    assert.equal(rows.find((r) => r.key === 'SEQ-3MM|PINK^PURE GLASS')!.total, '100000');
    assert.equal(rows.find((r) => r.key === 'SEQ-3MM|PINK^MATT')!.type, 'MATT');
    assert.equal(rows.find((r) => r.key === 'SEQ-4MM|WHITE^PURE GLASS')!.total, '100000');
  });

  it('type rates match the rate sheet (₹8,000 + 5% per roll → 3-MM ₹0.00127, 9-MM ₹0.01143)', async () => {
    const res = await ctx.api.put('/api/costing/type-rates/SEQUENCE/pure%20glass').set(admin()).send({ basicRate: 8000, gstPercent: 5 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const glass = res.body.find((r: { type: string }) => r.type === 'PURE GLASS');
    assert.equal(glass.rateInclGst, '8400');
    assert.equal(glass.purchaseUnit, 'Rolls');
    const per = (code: string) => Number(Number(glass.perMaterial.find((m: { code: string }) => m.code === code).costPerUnit).toFixed(5));
    assert.equal(per('SEQ-3MM'), 0.00127);
    assert.equal(per('SEQ-4MM'), 0.00215);
    assert.equal(per('SEQ-9MM'), 0.01143);
    await ctx.api.put('/api/costing/type-rates/SEQUENCE/MATT').set(admin()).send({ basicRate: 2500, gstPercent: 5 });
    assert.equal((await ctx.api.put('/api/costing/type-rates/SEQUENCE/GOLD').set(admin()).send({ basicRate: 1, gstPercent: 0 })).status, 404);
    // Typed materials are priced by type, so they are not in the per-material rate list.
    const rates = (await ctx.api.get('/api/costing/rates').set(admin())).body as { key: string }[];
    assert.equal(rates.some((r) => r.key.startsWith('SEQ-')), false);
  });

  it('an order is edited (party, quantities, types); a new party gets its next number', async () => {
    const created = await ctx.api
      .post('/api/orders')
      .set(admin())
      .send({ designNo: 'SQ-1', party: 'EDIT', quantity: 10, types: { 'SEQ-3MM|PINK': 'MATT', 'SEQ-4MM|WHITE': 'MATT' } });
    assert.equal(created.status, 201);
    const cost = async () => (await ctx.api.get(`/api/costing/orders/${created.body.orderNo}`).set(admin())).body;
    const before = await cost();

    const edited = await ctx.api
      .put(`/api/orders/${created.body.orderNo}`)
      .set(admin())
      .send({ party: 'ABC', orderDate: '2026-10-20', quantity: 20, types: { 'SEQ-3MM|PINK': 'PURE GLASS', 'SEQ-4MM|WHITE': 'MATT' } });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.party, 'ABC');
    assert.equal(edited.body.partyOrderNo, 3); // ABC already has #1 and #2 for SQ-1
    assert.equal(edited.body.orderDate, '2026-10-20');
    assert.equal(edited.body.totalPieces, 20);
    assert.equal(edited.body.types['SEQ-3MM|PINK'], 'PURE GLASS');

    const after = await cost();
    // 20 pcs × 100 PINK at the PURE GLASS rate (₹8,400 per roll ÷ 6,636,000) + 20 × 50 WHITE at MATT (₹2,625 ÷ 3,914,625)
    const expected = (20 * 100 * 8400) / 6636000 + (20 * 50 * 2625) / 3914625;
    assert.equal(round2(after.total), Number(expected.toFixed(2)));
    assert.notEqual(after.total, before.total);
    assert.equal((await ctx.api.put(`/api/orders/${created.body.orderNo}`).set(admin()).send({ party: 'ABC', quantity: 5 })).status, 400);
  });
});
