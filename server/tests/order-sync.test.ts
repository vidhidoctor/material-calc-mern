import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { OrderModel } from '../src/modules/orders/order.model.js';
import { bearer, startTestApp, type TestContext } from './helpers.js';

type Line = { component: string; size: string; quantity: number; fromDesign?: boolean };

/**
 * A component added to a design in Punching after an order was made joins that order automatically
 * (order drawer, summary, cost, procurement, print) without changing anything saved on the order.
 */
describe('orders follow components added to the design later', () => {
  let ctx: TestContext;
  const admin = () => bearer(ctx.adminToken);
  const putComponent = (design: string, name: string, sizes: string[], qty = 100) =>
    ctx.api
      .put(`/api/designs/${design}/components/${name}`)
      .set(admin())
      .send({ sizes: sizes.map((size) => ({ size, stitch: 1, consumption: { 'B-2MM': qty } })) });
  const order = async (body: object) => {
    const res = await ctx.api.post('/api/orders').set(admin()).send(body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.orderNo as number;
  };
  const getOrder = async (orderNo: number) => (await ctx.api.get(`/api/orders/${orderNo}`).set(admin())).body;
  const added = (lines: Line[]) => lines.filter((l) => l.fromDesign).map((l) => `${l.component} ${l.size}:${l.quantity}`);

  let sameForAll: number;
  let perSizeAll: number;

  before(async () => {
    ctx = await startTestApp();
    const material = await ctx.api.post('/api/materials').set(admin()).send({ code: 'B-2MM', category: 'BEAD', rules: { pcsPerKg: 1000 } });
    assert.equal(material.status, 201, JSON.stringify(material.body));
    await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'D-1', productName: 'Lehenga' });
    assert.equal((await putComponent('D-1', 'DUPATTA', ['ALL'])).status, 200);
    sameForAll = await order({ designNo: 'D-1', party: 'SAME', quantity: 50 });
    perSizeAll = await order({ designNo: 'D-1', party: 'ROWS', lines: [{ component: 'DUPATTA', size: 'ALL', quantity: 30 }] });
    // Punching adds KALI after both orders were made (and printed).
    assert.equal((await putComponent('D-1', 'KALI', ['18', '20'])).status, 200);
  });
  after(async () => {
    await ctx.stop();
  });

  it('"same for all rows" order: the new component joins with the same quantity', async () => {
    const o = await getOrder(sameForAll);
    assert.deepEqual(added(o.lines), ['KALI 18:50', 'KALI 20:50']);
    assert.deepEqual(o.addedComponents, ['KALI']);
    assert.equal(o.totalPieces, 150);

    const summary = (await ctx.api.get(`/api/orders/${sameForAll}/summary`).set(admin())).body;
    assert.deepEqual(summary.components.map((c: { component: string }) => c.component), ['DUPATTA', 'KALI']);
    // 3 lines × 50 pieces × 100 beads = 15,000 beads.
    assert.equal(summary.totals['B-2MM'], '15000');

    const slip = (await ctx.api.get(`/api/orders/${sameForAll}/purchase-order`).set(admin())).body;
    // One section per component, the added one included: DUPATTA 50 × 100, KALI 2 × 50 × 100.
    assert.deepEqual(slip.sections.map((x: { title: string }) => x.title), ['DUPATTA', 'KALI']);
    assert.deepEqual(slip.sections.map((x: { rows: { totalQty: string }[] }) => x.rows[0]!.totalQty), ['5000', '10000']);

    const purchase = (await ctx.api.get('/api/purchase/requirements').query({ orderNo: sameForAll }).set(admin())).body;
    assert.equal(purchase.totals.find((t: { key: string }) => t.key === 'B-2MM').total, '15000');
  });

  it('nothing saved on the order changes', async () => {
    const saved = await OrderModel.findOne({ orderNo: sameForAll }).lean();
    assert.deepEqual(saved!.lines.map((l) => `${l.component} ${l.size}:${l.quantity}`), ['DUPATTA ALL:50']);
  });

  it('per-row order whose sizes match nothing: the new component is pending (Edit order), quantities unchanged', async () => {
    const o = await getOrder(perSizeAll);
    assert.deepEqual(added(o.lines), []);
    assert.deepEqual(o.pendingComponents, ['KALI']);
    assert.equal(o.totalPieces, 30);
  });

  it('per-row order: matching sizes take the quantity ordered for that size; a one-size component one per set', async () => {
    const rows = await order({
      designNo: 'D-1',
      party: 'SIZES',
      lines: [
        { component: 'DUPATTA', size: 'ALL', quantity: 30 },
        { component: 'KALI', size: '18', quantity: 10 },
        { component: 'KALI', size: '20', quantity: 20 },
      ],
    });
    await putComponent('D-1', 'BLOUSE', ['18', '20', '22']);
    await putComponent('D-1', 'BELT', ['FREE']);
    const o = await getOrder(rows);
    // BLOUSE: 18 → 10, 20 → 20, 22 not ordered; BELT (one size): one per set = 10 + 20 + 30 (ALL).
    assert.deepEqual(added(o.lines), ['BLOUSE 18:10', 'BLOUSE 20:20', 'BELT FREE:60']);
    assert.deepEqual(o.addedComponents, ['BLOUSE', 'BELT']);
  });

  it('a component left out on purpose stays out', async () => {
    const onlyDupatta = await order({ designNo: 'D-1', party: 'ONLY', lines: [{ component: 'DUPATTA', size: 'ALL', quantity: 5 }, { component: 'KALI', size: '18', quantity: 0 }] });
    const o = await getOrder(onlyDupatta);
    assert.deepEqual(added(o.lines), []);
    assert.deepEqual(o.pendingComponents, []);
    // A component added after this order still joins it.
    await putComponent('D-1', 'SLEEVE', ['18']);
    assert.deepEqual(o.addedComponents, []);
    assert.deepEqual((await getOrder(onlyDupatta)).pendingComponents, ['SLEEVE']);
  });

  it('Edit order saves the added component like any other line', async () => {
    const before = await getOrder(sameForAll);
    const res = await ctx.api.put(`/api/orders/${sameForAll}`).set(admin()).send({ party: before.party, quantity: 50, types: {} });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const saved = await OrderModel.findOne({ orderNo: sameForAll }).lean();
    assert.ok(saved!.lines.some((l) => l.component === 'KALI'));
    assert.deepEqual(res.body.addedComponents, []);
  });
});
