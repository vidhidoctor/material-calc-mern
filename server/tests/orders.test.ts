import { MESSAGES } from '@app/shared';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Decimal } from '../src/calculation/engine.js';
import { MaterialModel } from '../src/modules/materials/material.model.js';
import { OrderModel } from '../src/modules/orders/order.model.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';
import { createFixtureOrder, fixture, loadFixture, round2 } from './fixture.js';

interface PurchaseTotal {
  key: string;
  color: string | null;
  code: string;
  total: string;
  values: Record<string, string> | null;
  purchase: string | null;
  error?: string;
}

describe('production orders and purchase requirements', () => {
  let ctx: TestContext;
  let prod: string;
  let fixtureOrderNo: number;

  const purchase = async (query: Record<string, string> = {}) => {
    const res = await ctx.api.get('/api/purchase/requirements').query(query).set(bearer(prod));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body as { orderNos: number[]; components: string[]; totals: PurchaseTotal[]; errors: string[] };
  };
  /** Row by variant key: a plain material code, or "CODE|COLOR". */
  const totalOf = (totals: PurchaseTotal[], key: string) => totals.find((t) => t.key === key)!;

  before(async () => {
    ctx = await startTestApp();
    await loadFixture(ctx.api, ctx.adminToken);
    prod = (await createActiveUser(ctx, { email: 'prod@example.com', roleName: 'Production Employee' })).token;
    fixtureOrderNo = await createFixtureOrder(ctx.api, prod);
  });
  after(async () => {
    await ctx.stop();
  });

  it('order 26-49 (MATRIAL.xlsx) gives 3-MM 1.34 rolls, 2.5-MM 21.94 KG, Cord 38.56 KG', async () => {
    assert.equal(fixtureOrderNo, 1);
    const body = await purchase({ orderNo: String(fixtureOrderNo) });
    assert.deepEqual(body.errors, []);
    assert.equal(round2(totalOf(body.totals, 'SEQ-3MM').purchase!), 1.34);
    assert.equal(round2(totalOf(body.totals, 'BEAD-2.5MM').purchase!), 21.94);
    assert.equal(round2(totalOf(body.totals, 'CORD').purchase!), 38.56);
  });

  it('matches every expected total and purchase value of the fixture', async () => {
    const body = await purchase({ orderNo: '1' });
    for (const [code, expected] of Object.entries(fixture.expected.totals)) {
      assert.equal(Number(totalOf(body.totals, code).total), expected, code);
    }
    for (const [code, expected] of Object.entries(fixture.expected.purchase)) {
      const got = totalOf(body.totals, code).values!;
      const stepKey: Record<string, string> = { cds: 'CD', rolls: 'ROLLS', kg: 'KG', grams: 'GRAMS' };
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(round2(got[stepKey[key]!]!), value, `${code}.${key}`);
      }
    }
  });

  it('the order page summary has 37 rows with requirements and totals', async () => {
    const res = await ctx.api.get('/api/orders/1/summary').set(bearer(prod));
    assert.equal(res.status, 200);
    assert.equal(res.body.rows.length, 37);
    assert.deepEqual(res.body.rows[0], { component: 'KALI', size: '18', quantity: 230, requirements: { 'SEQ-3MM': '224250', 'SEQ-4MM': '224250', CORD: '6900' },
      purchase: { 'SEQ-3MM': '7.096519', 'SEQ-4MM': '9.452055', CORD: '0.92' },
    });
    assert.equal(res.body.totals['SEQ-3MM'], '8861475');
    assert.equal(res.body.totals.CORD, '289206.5');
    assert.deepEqual(res.body.errors, []);
  });

  it('the order summary shows purchase units: sequences in CD (whole CDs to buy), beads and cord in KG', async () => {
    const res = await ctx.api.get('/api/orders/1/summary').set(bearer(prod));
    assert.equal(res.status, 200);
    type Column = { key: string; orderUnit: string | null; wholeUnits: boolean };
    const column = (key: string) => (res.body.columns as Column[]).find((c) => c.key === key)!;
    assert.deepEqual([column('SEQ-3MM').orderUnit, column('SEQ-3MM').wholeUnits], ['CD', true]);
    assert.deepEqual([column('BEAD-2.5MM').orderUnit, column('BEAD-2.5MM').wholeUnits], ['KG', false]);
    assert.deepEqual([column('CORD').orderUnit, column('CORD').wholeUnits], ['KG', false]);

    // Row: KALI 18 × 230 = 224,250 sequences ÷ 31,600 per CD = 7.0965… CD (rows are not rounded).
    assert.equal(res.body.rows[0].purchase['SEQ-3MM'], '7.096519');
    // Totals come from the total consumption: 8,861,475 ÷ 31,600 = 280.43 CD → buy 281 whole CDs.
    assert.equal(round2(res.body.purchaseTotals['SEQ-3MM']), 280.43);
    assert.equal(res.body.buy['SEQ-3MM'], '281');
    // KG is not rounded up: 21.94 KG of 2.5 MM beads, 38.56 KG of cord.
    assert.equal(round2(res.body.buy['BEAD-2.5MM']), 21.94);
    assert.equal(round2(res.body.buy.CORD), 38.56);

    // Component totals add up to the order total.
    type Component = { component: string; quantity: number; purchase: Record<string, string>; requirements: Record<string, string> };
    const components = res.body.components as Component[];
    assert.equal(components[0]!.component, 'KALI');
    const sum = components.reduce((s, c) => s + Number(c.requirements['SEQ-3MM'] ?? 0), 0);
    assert.equal(sum, 8861475);
    const cds = components.reduce((s, c) => s + Number(c.purchase['SEQ-3MM'] ?? 0), 0);
    assert.equal(round2(String(cds)), 280.43);
  });

  it('purchase order slip: one section per component with every material it uses', async () => {
    const res = await ctx.api.get('/api/orders/1/purchase-order').set(bearer(prod));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    type Row = { id: string; label: string; qty: string | null; unit: string | null; totalQty: string; totalUnit: string; name: string };
    type Section = { id: string; title: string; itemHeader: string; unit: string | null; rows: Row[] };
    const sections = res.body.sections as Section[];
    assert.equal(res.body.designNo, '26-49');

    // Sections follow the order's components; every section is a component.
    const summary = (await ctx.api.get('/api/orders/1/summary').set(bearer(prod))).body;
    assert.deepEqual(sections.map((x) => x.id), summary.components.map((c: { component: string }) => `C:${c.component}`));

    // KALI: sequences (whole CDs) and cord (KG) together.
    const kali = sections.find((x) => x.id === 'C:KALI')!;
    assert.deepEqual([kali.title, kali.itemHeader, kali.unit], ['KALI', 'Material', null]);
    // Materials in Material Master order: sequences first … cord last.
    assert.deepEqual(kali.rows.slice(0, 2).map((r) => r.id), ['C:KALI::SEQ-3MM', 'C:KALI::SEQ-4MM']);
    assert.match(kali.rows[0]!.qty!, /^\d+$/, 'whole CDs');
    const kaliCord = kali.rows.at(-1)!;
    assert.deepEqual([kaliCord.id, kaliCord.unit, kaliCord.totalUnit], ['C:KALI::CORD', 'KG', 'MTR']);

    // Totals over all components match the order: sequences rounded up per component, KG as worked out.
    const rows = (key: string) => sections.flatMap((x) => x.rows.filter((r) => r.id.endsWith(`::${key}`)));
    assert.ok(rows('SEQ-3MM').reduce((sum, r) => sum + Number(r.qty), 0) >= 281);
    assert.equal(rows('SEQ-3MM').reduce((sum, r) => sum + Number(r.totalQty), 0), 8861475);
    const kg = (key: string) => round2(String(rows(key).reduce((sum, r) => sum + Number(r.qty), 0)));
    assert.equal(kg('BEAD-2.5MM'), 21.94);
    assert.equal(kg('CORD'), 38.56);
    assert.equal(rows('CORD').reduce((sum, r) => sum + Number(r.totalQty), 0), 289206.5);
  });

  it('purchase order names are saved per component row and printed exactly as entered', async () => {
    const rowOf = (body: { sections: { rows: { id: string; name: string }[] }[] }, id: string) =>
      body.sections.flatMap((x) => x.rows).find((r) => r.id === id)!;
    const saved = await ctx.api
      .put('/api/orders/1/purchase-order/names')
      .set(bearer(prod))
      .send({ names: { 'C:KALI::CORD': 'Ramesh bhai (Surat)', 'C:KALI::SEQ-3MM': 'Shree Sequins' } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(rowOf(saved.body, 'C:KALI::CORD').name, 'Ramesh bhai (Surat)');

    // Blank removes; others are kept.
    const cleared = await ctx.api.put('/api/orders/1/purchase-order/names').set(bearer(prod)).send({ names: { 'C:KALI::CORD': '  ' } });
    assert.equal(rowOf(cleared.body, 'C:KALI::CORD').name, '');
    assert.equal(rowOf(cleared.body, 'C:KALI::SEQ-3MM').name, 'Shree Sequins');

    const tooLong = await ctx.api.put('/api/orders/1/purchase-order/names').set(bearer(prod)).send({ names: { 'C:KALI::CORD': 'x'.repeat(101) } });
    assert.equal(tooLong.status, 400);
    await ctx.api.put('/api/orders/1/purchase-order/names').set(bearer(prod)).send({ names: { 'C:KALI::SEQ-3MM': '' } });
  });

  it('names written on the old per-category slip still show on each component row, and can be changed per row', async () => {
    await OrderModel.updateOne({ orderNo: 1 }, { $set: { poNames: [{ key: 'K:CORD::CORD', name: 'Old cord supplier' }] } });
    const res = (await ctx.api.get('/api/orders/1/purchase-order').set(bearer(prod))).body;
    const cordRows = res.sections.flatMap((x: { rows: { id: string; name: string }[] }) => x.rows).filter((r: { id: string }) => r.id.endsWith('::CORD'));
    assert.ok(cordRows.length > 1);
    for (const r of cordRows) assert.equal(r.name, 'Old cord supplier');

    // Clearing one row clears only that row; the old category entry is gone.
    const saved = await ctx.api.put('/api/orders/1/purchase-order/names').set(bearer(prod)).send({ names: { 'C:KALI::CORD': '' } });
    const after = saved.body.sections.flatMap((x: { rows: { id: string; name: string }[] }) => x.rows).filter((r: { id: string }) => r.id.endsWith('::CORD'));
    assert.equal(after.find((r: { id: string }) => r.id === 'C:KALI::CORD').name, '');
    assert.ok(after.filter((r: { id: string }) => r.id !== 'C:KALI::CORD').every((r: { name: string }) => r.name === 'Old cord supplier'));
    const stored = (await OrderModel.findOne({ orderNo: 1 }).lean())!.poNames!;
    assert.equal(stored.some((n) => n.key.startsWith('K:')), false);
    await OrderModel.updateOne({ orderNo: 1 }, { $unset: { poNames: '' } });
  });

  it('cord: denier and rate per KG are entered on the order; weight = metres × denier ÷ 9,000,000, cost = weight × rate', async () => {
    type Cord = { denier: number | null; ratePerUnit: string | null; cost: string | null; rateUnit: string };
    type Column = { key: string; categoryName: string; cord?: Cord };
    const cordOf = (body: { columns: Column[] }) => body.columns.find((c) => c.key === 'CORD')!;
    const admin = bearer(ctx.adminToken);

    const before = (await ctx.api.get('/api/orders/1/summary').set(bearer(prod))).body;
    assert.equal(cordOf(before).categoryName, 'Cord');
    // The fixture order has its cord denier (1,200) entered on the order.
    assert.deepEqual(cordOf(before).cord, { denier: 1200, ratePerUnit: null, cost: null, rateUnit: 'KG' });
    assert.equal(before.columns.find((c: Column) => c.key === 'SEQ-3MM').cord, undefined);

    // Production enters the denier; only users who see costs may enter the rate.
    const denied = await ctx.api.put('/api/orders/1/cords').set(bearer(prod)).send({ cords: { CORD: { ratePerUnit: 550 } } });
    assert.equal(denied.status, 403);
    const saved = await ctx.api.put('/api/orders/1/cords').set(bearer(prod)).send({ cords: { CORD: { denier: 150 } } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    // 289,206.5 m × 150 ÷ 9,000,000 = 4.820108 KG.
    assert.equal(saved.body.buy.CORD, '4.820108');

    const priced = await ctx.api.put('/api/orders/1/cords').set(admin).send({ cords: { CORD: { ratePerUnit: 550 } } });
    assert.equal(priced.status, 200, JSON.stringify(priced.body));
    const cord = cordOf(priced.body).cord!;
    assert.deepEqual([cord.denier, cord.ratePerUnit], [150, '550']);
    // 4.8201083… KG × ₹550 = ₹2,651.06
    assert.equal(round2(cord.cost!), 2651.06);
    // Production sees the denier and weight, never ₹.
    const prodView = (await ctx.api.get('/api/orders/1/summary').set(bearer(prod))).body;
    assert.deepEqual(cordOf(prodView).cord, { denier: 150, ratePerUnit: null, cost: null, rateUnit: 'KG' });

    // The popup's preview does not save.
    const preview = await ctx.api.post('/api/orders/1/cords/preview').set(admin).send({ cords: { CORD: { denier: 300 } } });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(round2(preview.body.buy.CORD), 9.64);
    assert.equal(round2(cordOf(preview.body).cord!.cost!), 5302.12);
    assert.equal((await ctx.api.get('/api/orders/1/summary').set(admin)).body.buy.CORD, '4.820108');

    // The order's cost, component detail, slip and procurement all use the order's denier and rate.
    const cost = (await ctx.api.get('/api/costing/orders/1').set(admin)).body;
    assert.ok(!cost.errors.some((e: string) => e.startsWith('CORD')), JSON.stringify(cost.errors));
    const breakdown = (await ctx.api.get('/api/orders/1/breakdown').set(admin)).body;
    const cordRows = breakdown.rows.filter((r: { code: string }) => r.code === 'CORD');
    assert.equal(cordRows[0].fields.denier, 150);
    assert.equal(cordRows[0].ratePerPurchaseUnit, '550');
    const amount = cordRows.reduce((sum: Decimal, r: { amount: string }) => sum.plus(r.amount), new Decimal(0));
    assert.equal(round2(amount.toString()), 2651.06);
    const slip = (await ctx.api.get('/api/orders/1/purchase-order').set(admin)).body;
    const slipCord = slip.sections.flatMap((x: { rows: { id: string; qty: string }[] }) => x.rows).filter((r: { id: string }) => r.id.endsWith('::CORD'));
    assert.equal(round2(String(slipCord.reduce((sum: number, r: { qty: string }) => sum + Number(r.qty), 0))), 4.82);
    assert.equal(round2(totalOf((await purchase({ orderNo: '1' })).totals, 'CORD').purchase!), 4.82);

    // Only this order's cords; values must be positive.
    assert.equal((await ctx.api.put('/api/orders/1/cords').set(admin).send({ cords: { 'SEQ-3MM': { denier: 5 } } })).status, 400);
    assert.equal((await ctx.api.put('/api/orders/1/cords').set(admin).send({ cords: { CORD: { denier: 0 } } })).status, 400);

    // Back to the fixture values for the other tests.
    const reset = await ctx.api.put('/api/orders/1/cords').set(admin).send({ cords: { CORD: { denier: 1200, ratePerUnit: null } } });
    assert.equal(round2(reset.body.buy.CORD), 38.56);
  });

  it('cord without a denier on the order: no weight, a clear message, procurement names the order', async () => {
    const admin = bearer(ctx.adminToken);
    await ctx.api.put('/api/orders/1/cords').set(admin).send({ cords: { CORD: { denier: null } } });
    try {
      const summary = (await ctx.api.get('/api/orders/1/summary').set(bearer(prod))).body;
      const cord = summary.columns.find((c: { key: string }) => c.key === 'CORD');
      assert.equal(cord.error, MESSAGES.CORD_DENIER_FOR_ORDER);
      assert.equal(cord.orderUnit, null);
      assert.equal(summary.buy.CORD, undefined);
      const body = await purchase({ orderNo: '1' });
      assert.match(totalOf(body.totals, 'CORD').error!, /enter the cord denier in order AB TRADERS-1|enter the cord denier in order/);
    } finally {
      await ctx.api.put('/api/orders/1/cords').set(admin).send({ cords: { CORD: { denier: 1200 } } });
    }
  });

  it('a material without its conversion rule keeps its consumption unit and reports why', async () => {
    const before = await MaterialModel.findOne({ code: 'SEQ-7MM' });
    await MaterialModel.updateOne({ code: 'SEQ-7MM' }, { $unset: { 'rules.seqPerCd': '' } });
    try {
      const res = await ctx.api.get('/api/orders/1/summary').set(bearer(prod));
      const column = res.body.columns.find((c: { key: string }) => c.key === 'SEQ-7MM');
      assert.equal(column.orderUnit, null);
      assert.ok(column.error);
      assert.equal(res.body.buy['SEQ-7MM'], undefined);
    } finally {
      await MaterialModel.updateOne({ code: 'SEQ-7MM' }, { $set: { rules: before!.rules } });
    }
  });

  describe('creating orders', () => {
    it('"same for all rows": every component + size at one quantity', async () => {
      const res = await ctx.api.post('/api/orders').set(bearer(prod)).send({ designNo: '26-49', party: ' ab traders ', quantity: 10, orderDate: '2026-10-01' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.orderNo, 2);
      assert.equal(res.body.quantity, 10);
      assert.equal(res.body.lines.length, 37);
      assert.equal(res.body.totalPieces, 370);
      assert.equal(res.body.party, 'AB TRADERS');
      assert.equal(res.body.item, 'CHOLI');
      assert.equal(res.body.orderDate, '2026-10-01');
      assert.equal(res.body.status, 'PENDING');
    });

    it('"different per row": zero rows are not ordered, quantity is null', async () => {
      const res = await ctx.api
        .post('/api/orders')
        .set(bearer(prod))
        .send({
          designNo: '26-49',
          party: 'CD',
          lines: [
            { component: 'KALI', size: '18', quantity: 5 },
            { component: 'KALI', size: '20', quantity: 0 },
            { component: 'belt', size: 'all', quantity: 7 },
          ],
        });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.quantity, null);
      assert.deepEqual(res.body.lines, [
        { component: 'KALI', size: '18', quantity: 5 },
        { component: 'BELT', size: 'ALL', quantity: 7 },
      ]);
      assert.match(res.body.orderDate, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('invalid quantities use the FRD message', async () => {
      const post = (body: object) => ctx.api.post('/api/orders').set(bearer(prod)).send({ designNo: '26-49', party: 'X', ...body });
      for (const body of [{}, { quantity: 0 }, { quantity: -3 }, { quantity: 2.5 }, { quantity: 'ten' }, { lines: [] }]) {
        const res = await post(body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.error, MESSAGES.INVALID_ORDER_QUANTITY, JSON.stringify(body));
      }
      const row = await post({ lines: [{ component: 'KALI', size: '18', quantity: -1 }] });
      assert.equal(row.body.error, `KALI 18: ${MESSAGES.INVALID_ORDER_QUANTITY}`);
    });

    it('unknown component + size → CONSUMPTION_MISSING with details', async () => {
      const res = await ctx.api
        .post('/api/orders')
        .set(bearer(prod))
        .send({ designNo: '26-49', party: 'X', lines: [{ component: 'FROCK', size: '18', quantity: 2 }, { component: 'KALI', size: '18', quantity: 1 }] });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, MESSAGES.CONSUMPTION_MISSING);
      assert.deepEqual(res.body.details, { missing: [{ component: 'FROCK', size: '18' }] });
    });

    it('a design with no components cannot be ordered; unknown design → 404', async () => {
      assert.equal((await ctx.api.post('/api/designs').set(bearer(ctx.adminToken)).send({ designNo: '40-00', productName: 'Empty' })).status, 201);
      const empty = await ctx.api.post('/api/orders').set(bearer(prod)).send({ designNo: '40-00', party: 'X', quantity: 1 });
      assert.equal(empty.status, 400);
      assert.equal(empty.body.error, 'Design 40-00 has no components yet.');
      assert.equal((await ctx.api.post('/api/orders').set(bearer(prod)).send({ designNo: '99-99', party: 'X', quantity: 1 })).status, 404);
    });
  });

  describe('orders list, status and lookups', () => {
    it('lists orders newest first', async () => {
      const res = await ctx.api.get('/api/orders').set(bearer(prod));
      assert.deepEqual(res.body.map((o: { orderNo: number }) => o.orderNo), [3, 2, 1]);
      assert.equal(res.body[2].totalPieces, fixture.order.lines.reduce((s, l) => s + l.quantity, 0));
    });

    it('changes status; bad values → 400', async () => {
      const res = await ctx.api.patch('/api/orders/2/status').set(bearer(prod)).send({ status: 'IN_PROGRESS' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'IN_PROGRESS');
      assert.equal((await ctx.api.patch('/api/orders/2/status').set(bearer(prod)).send({ status: 'DONE' })).status, 400);
    });

    it('non-numeric orderNo → 400, unknown → 404', async () => {
      const bad = await ctx.api.get('/api/orders/abc').set(bearer(prod));
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error, 'Invalid order number.');
      assert.equal((await ctx.api.get('/api/orders/999').set(bearer(prod))).status, 404);
      assert.equal((await ctx.api.get('/api/purchase/requirements?orderNo=x').set(bearer(prod))).status, 400);
      assert.equal((await ctx.api.get('/api/purchase/requirements?orderNo=999').set(bearer(prod))).status, 404);
    });

    it('production design search lists only designs with components, with counts and previous orders', async () => {
      const list = await ctx.api.get('/api/production/designs').set(bearer(prod));
      assert.deepEqual(list.body.map((d: { designNo: string }) => d.designNo), ['26-49']);
      assert.equal(list.body[0].entries, 37);
      assert.equal(list.body[0].orders, 3);

      const detail = await ctx.api.get('/api/production/designs/26-49').set(bearer(prod));
      assert.equal(detail.status, 200);
      assert.deepEqual(detail.body.previousOrders.map((o: { orderNo: number }) => o.orderNo), [3, 2, 1]);
      assert.deepEqual(detail.body.previousOrders[1], { orderNo: 2, partyOrderNo: 1, party: 'AB TRADERS', quantity: 10, totalPieces: 370, status: 'IN_PROGRESS', orderDate: '2026-10-01' });
    });
  });

  describe('purchase requirements', () => {
    it('combines all orders except CANCELLED', async () => {
      const before = Number(totalOf((await purchase()).totals, 'SEQ-3MM').total);
      // Order #2: 10 of every row → 10 × sum of SEQ-3MM consumption per piece.
      const perPiece = fixture.design.components.flatMap((c) => c.sizes).reduce((s, size) => s + (size.consumption['SEQ-3MM'] ?? 0), 0);
      assert.equal((await ctx.api.patch('/api/orders/2/status').set(bearer(prod)).send({ status: 'CANCELLED' })).status, 200);
      const after = await purchase();
      assert.deepEqual(after.orderNos, [1, 3]);
      assert.equal(before - Number(totalOf(after.totals, 'SEQ-3MM').total), perPiece * 10);
      // A cancelled order can still be viewed on its own.
      assert.deepEqual((await purchase({ orderNo: '2' })).orderNos, [2]);
    });

    it('filters by component (BELT only vs KALI only)', async () => {
      const belt = await purchase({ orderNo: '1', components: 'belt' });
      assert.deepEqual(belt.components, ['BELT']);
      assert.equal(totalOf(belt.totals, 'SEQ-3MM').total, String(290 * 405));
      assert.equal(totalOf(belt.totals, 'BEAD-2.5MM').total, '0');

      const kali = await purchase({ orderNo: '1', components: 'KALI' });
      assert.equal(totalOf(kali.totals, 'BEAD-2.5MM').total, '0');
      assert.ok(Number(totalOf(kali.totals, 'SEQ-7MM').total) > 0);

      const frock = await purchase({ orderNo: '1', components: 'FROCK' });
      assert.ok(frock.totals.every((t) => t.total === '0'));
    });

    it('reports a missing conversion rule instead of crashing', async () => {
      // The API always requires rules; simulate legacy data with a rule missing in the DB.
      // (A cord's denier is entered on the order, so it is not a Material Master rule: see the cord tests.)
      await MaterialModel.updateOne({ code: 'PIPE-4MM' }, { $unset: { 'rules.pcsPerKg': '' } });
      try {
        const body = await purchase({ orderNo: '1' });
        assert.equal(totalOf(body.totals, 'PIPE-4MM').purchase, null);
        assert.equal(totalOf(body.totals, 'PIPE-4MM').error, MESSAGES.CONVERSION_RULE_MISSING);
        assert.deepEqual(body.errors, [`PIPE-4MM: ${MESSAGES.CONVERSION_RULE_MISSING}`]);
      } finally {
        await MaterialModel.updateOne({ code: 'PIPE-4MM' }, { $set: { 'rules.pcsPerKg': 35000 } });
      }
    });
  });

  describe('colour variants', () => {
    it('order summary and purchase keep each colour separate', async () => {
      await ctx.api.post('/api/designs').set(bearer(ctx.adminToken)).send({ designNo: 'BL-102', productName: 'Blouse' });
      const put = await ctx.api
        .put('/api/designs/BL-102/components/BLOUSE')
        .set(bearer(ctx.adminToken))
        .send({ sizes: [{ size: '18', stitch: 1, consumption: { 'SEQ-3MM|WHITE': 120, 'SEQ-3MM|LIGHT PINK': 80, 'SEQ-3MM|DARK PINK': 60 } }] });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      const order = await ctx.api.post('/api/orders').set(bearer(prod)).send({ designNo: 'BL-102', party: 'COLOR', quantity: 200 });
      assert.equal(order.status, 201, JSON.stringify(order.body));

      const summary = await ctx.api.get(`/api/orders/${order.body.orderNo}/summary`).set(bearer(prod));
      assert.deepEqual(
        summary.body.columns.map((c: { key: string; color: string | null; unit: string }) => [c.key, c.color, c.unit]),
        [
          ['SEQ-3MM|WHITE', 'WHITE', 'PCS'],
          ['SEQ-3MM|LIGHT PINK', 'LIGHT PINK', 'PCS'],
          ['SEQ-3MM|DARK PINK', 'DARK PINK', 'PCS'],
        ],
      );
      assert.deepEqual(summary.body.totals, { 'SEQ-3MM|WHITE': '24000', 'SEQ-3MM|LIGHT PINK': '16000', 'SEQ-3MM|DARK PINK': '12000' });

      const body = await purchase({ orderNo: String(order.body.orderNo) });
      const white = totalOf(body.totals, 'SEQ-3MM|WHITE');
      assert.deepEqual([white.code, white.color, white.total], ['SEQ-3MM', 'WHITE', '24000']);
      // Each colour is converted on its own: 24,000 ÷ 31,600 = 0.76 CD of white.
      assert.equal(round2(white.values!.CD!), 0.76);
      assert.equal(round2(totalOf(body.totals, 'SEQ-3MM|DARK PINK').values!.CD!), 0.38);
      // The plain SEQ-3MM row is separate (nothing ordered without a colour).
      assert.equal(totalOf(body.totals, 'SEQ-3MM').total, '0');
      assert.equal((await ctx.api.delete(`/api/orders/${order.body.orderNo}`).set(bearer(prod))).status, 204);
    });
  });

  describe('per-party numbering (1, 2, 3 … per design + party)', () => {
    it('each party of a design has its own series', async () => {
      const post = (party: string) =>
        ctx.api.post('/api/orders').set(bearer(prod)).send({ designNo: '26-49', party, lines: [{ component: 'BELT', size: 'ALL', quantity: 1 }] });
      const fr2 = await post('FR');
      const fr3 = await post('fr');
      const cd2 = await post('CD');
      const newParty = await post('NEW PARTY');
      assert.deepEqual(
        [fr2, fr3, cd2, newParty].map((r) => [r.body.party, r.body.partyOrderNo]),
        [['FR', 2], ['FR', 3], ['CD', 2], ['NEW PARTY', 1]],
      );
      // The internal number keeps counting across all orders.
      assert.ok(newParty.body.orderNo > cd2.body.orderNo);

      const list = await ctx.api.get('/api/orders').set(bearer(prod));
      const fr = list.body.filter((o: { party: string }) => o.party === 'FR').map((o: { partyOrderNo: number }) => o.partyOrderNo);
      assert.deepEqual(fr, [3, 2, 1]);
    });

    it('older orders without a number are numbered per design + party, oldest first', async () => {
      const { OrderModel, backfillPartyOrderNos, nextPartyOrderNo } = await import('../src/modules/orders/order.model.js');
      const base = { designNo: '26-49', item: 'CHOLI', orderDate: new Date(), quantity: 1, status: 'PENDING', createdAt: new Date(), lines: [] };
      await OrderModel.collection.insertMany([
        { ...base, orderNo: 900, party: 'LEGACY' },
        { ...base, orderNo: 901, party: 'LEGACY' },
        { ...base, orderNo: 902, party: 'FR' },
      ]);
      assert.equal(await backfillPartyOrderNos(), 3);
      const legacy = await OrderModel.find({ party: 'LEGACY' }).sort({ orderNo: 1 });
      assert.deepEqual(legacy.map((o) => o.partyOrderNo), [1, 2]);
      assert.equal((await OrderModel.findOne({ orderNo: 902 }))?.partyOrderNo, 4);
      // Counters continue after the numbered ones; re-running does nothing.
      assert.equal(await nextPartyOrderNo('26-49', 'LEGACY'), 3);
      assert.equal(await backfillPartyOrderNos(), 0);
    });
  });

  describe('deleting an order', () => {
    it('removes it from lists and purchase; numbers are not reused', async () => {
      const created = await ctx.api
        .post('/api/orders')
        .set(bearer(prod))
        .send({ designNo: '26-49', party: 'DEL', lines: [{ component: 'BELT', size: 'ALL', quantity: 5 }] });
      assert.equal(created.status, 201);
      const { orderNo } = created.body;

      const punchingUser = await createActiveUser(ctx, { email: 'punch-del@example.com', roleName: 'Punching Employee', departmentName: 'Punching' });
      assert.equal((await ctx.api.delete(`/api/orders/${orderNo}`).set(bearer(punchingUser.token))).status, 403);

      assert.equal((await ctx.api.delete(`/api/orders/${orderNo}`).set(bearer(prod))).status, 204);
      assert.equal((await ctx.api.get(`/api/orders/${orderNo}`).set(bearer(prod))).status, 404);
      assert.equal((await ctx.api.delete(`/api/orders/${orderNo}`).set(bearer(prod))).status, 404);
      assert.equal((await purchase()).orderNos.includes(orderNo), false);

      const next = await ctx.api
        .post('/api/orders')
        .set(bearer(prod))
        .send({ designNo: '26-49', party: 'DEL', lines: [{ component: 'BELT', size: 'ALL', quantity: 5 }] });
      assert.equal(next.body.partyOrderNo, 2);
    });
  });

  describe('orders follow the design (§8)', () => {
    it('editing consumption changes an existing order\'s purchase figures', async () => {
      const before = await purchase({ orderNo: '1', components: 'BELT' });
      assert.equal(totalOf(before.totals, 'CORD').total, String(11 * 405));

      const res = await ctx.api
        .put('/api/designs/26-49/components/BELT')
        .set(bearer(ctx.adminToken))
        .send({ sizes: [{ size: 'ALL', stitch: 0, consumption: { 'SEQ-3MM': 290, CORD: 20 } }] });
      assert.equal(res.status, 200);

      const after = await purchase({ orderNo: '1', components: 'BELT' });
      assert.equal(totalOf(after.totals, 'CORD').total, String(20 * 405));
    });

    it('a size or component used by an order cannot be removed', async () => {
      const kali = fixture.design.components.find((c) => c.name === 'KALI')!;
      const withoutSize18 = kali.sizes.filter((s) => s.size !== '18').map((s) => ({ size: s.size, stitch: 0, consumption: s.consumption }));
      const res = await ctx.api.put('/api/designs/26-49/components/KALI').set(bearer(ctx.adminToken)).send({ sizes: withoutSize18 });
      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'KALI size 18 is used by order FR-1 and cannot be removed.');

      const del = await ctx.api.delete('/api/designs/26-49/components/GALISH').set(bearer(ctx.adminToken));
      assert.equal(del.status, 409);
      assert.equal(del.body.error, 'GALISH is used by order FR-1 and cannot be removed.');
    });

    it('a design with orders cannot be deleted or renumbered (product name can change)', async () => {
      const del = await ctx.api.delete('/api/designs/26-49').set(bearer(ctx.adminToken));
      assert.equal(del.status, 409);
      assert.equal(del.body.error, 'Design 26-49 is used by order FR-1 and cannot be deleted.');
      const rename = await ctx.api.patch('/api/designs/26-49').set(bearer(ctx.adminToken)).send({ designNo: '26-50' });
      assert.equal(rename.status, 409);
      assert.equal(rename.body.error, 'Design 26-49 is used by order FR-1, so its number cannot be changed.');
      const product = await ctx.api.patch('/api/designs/26-49').set(bearer(ctx.adminToken)).send({ designNo: '26-49', productName: 'CHOLI' });
      assert.equal(product.status, 200);
    });

    it('a new size can still be added to a used component', async () => {
      const belt = [{ size: 'ALL', stitch: 0, consumption: { CORD: 20 } }, { size: 'XL', stitch: 0, consumption: { CORD: 25 } }];
      assert.equal((await ctx.api.put('/api/designs/26-49/components/BELT').set(bearer(ctx.adminToken)).send({ sizes: belt })).status, 200);
    });
  });
});
