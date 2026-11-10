import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { costOfSize, markupPercentFor, sumCosts } from '../src/calculation/design-costing.js';
import { Decimal } from '../src/calculation/engine.js';
import { MaterialRateModel } from '../src/modules/costing/material-rate.model.js';
import { DesignCostingModel } from '../src/modules/design-costing/design-costing.model.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';
import { loadFixture, round2 } from './fixture.js';

const money = (value: Decimal) => value.toDecimalPlaces(2).toNumber();

describe('design costing maths', () => {
  const base100 = { stitch: 0, laser: null, stitchRate: null, laserRate: null, stitchHeads: 1, laserHeads: 1, materialCost: new Decimal(100) };

  it('₹100 base with 7% discount: final ₹107.53, markup ₹7.53, and after the discount ₹100 is left', () => {
    const c = costOfSize(base100, 7);
    assert.deepEqual([money(c.base), money(c.markup), money(c.finalPrice)], [100, 7.53, 107.53]);
    const discount = c.finalPrice.times(7).dividedBy(100);
    assert.equal(money(c.finalPrice.minus(discount)), 100, 'net receivable = base cost');
    assert.equal(c.finalPrice.minus(discount).toDecimalPlaces(10).toString(), '100');
    assert.equal(money(markupPercentFor(7)), 7.53);
    assert.deepEqual([money(costOfSize(base100, 0).finalPrice), money(markupPercentFor(0))], [100, 0]);
    assert.deepEqual([money(costOfSize(base100, 60).finalPrice), money(costOfSize(base100, 60).markup)], [250, 150]);
  });

  it('stitch and laser cost are multiplied by their own heads', () => {
    const c = costOfSize({ ...base100, stitch: 12500, laser: 3000, stitchRate: 4, laserRate: 2.5, stitchHeads: 1.5, laserHeads: 2, materialCost: new Decimal(1.5) }, 0);
    assert.deepEqual([money(c.stitchCost), money(c.laserCost), money(c.base)], [75, 15, 91.5]);
  });

  it('stitch and laser cost per 1000; blank rates cost nothing; totals add up', () => {
    const c = costOfSize({ ...base100, stitch: 12500, laser: 3000, stitchRate: 4, laserRate: 2.5, materialCost: new Decimal(1.5) }, 0);
    assert.deepEqual([money(c.stitchCost), money(c.laserCost), money(c.base), money(c.finalPrice)], [50, 7.5, 59, 59]);
    assert.equal(money(costOfSize({ ...base100, stitch: 5000, materialCost: new Decimal(0) }, 0).base), 0);
    assert.equal(money(sumCosts([c, c]).base), 118);
  });
});

describe('design costing API', () => {
  let ctx: TestContext;
  let manager: string;
  let viewer: string;
  let punching: string;
  const admin = () => bearer(ctx.adminToken);
  const path = '/api/design-costing/COST-1';
  const empty = { discountPercent: 0, rows: [], types: {}, cords: {} };
  const kali18 = { component: 'KALI', size: '18', stitchRate: 4, laserRate: 5, note: '  Rush job - check with Ramesh ' };

  const roleUser = async (email: string, roleName: string, permissions: string[]) => {
    assert.equal((await ctx.api.post('/api/admin/roles').set(admin()).send({ name: roleName, permissions })).status, 201);
    return (await createActiveUser(ctx, { email, roleName })).token;
  };

  before(async () => {
    ctx = await startTestApp();
    await loadFixture(ctx.api, ctx.adminToken);
    manager = await roleUser('manager@example.com', 'Manager', ['DESIGN_COSTING_VIEW', 'DESIGN_COSTING_MANAGE']);
    viewer = await roleUser('viewer@example.com', 'Costing Viewer', ['DESIGN_COSTING_VIEW']);
    punching = (await createActiveUser(ctx, { email: 'punch@example.com', roleName: 'Punching Employee', departmentName: 'Punching' })).token;

    // ₹1 per bead: 1,000 pieces per KG at ₹1,000 per KG.
    assert.equal((await ctx.api.post('/api/materials').set(admin()).send({ code: 'TST-BEAD', name: 'Test bead', category: 'BEAD', rules: { pcsPerKg: 1000 } })).status, 201);
    assert.equal((await ctx.api.put('/api/costing/rates/TST-BEAD').set(admin()).send({ basicRate: 1000, gstPercent: 0 })).status, 200);

    const sequence = (await ctx.api.get('/api/material-categories').set(admin())).body.find((c: { code: string }) => c.code === 'SEQUENCE');
    const { code: _code, materialCount: _count, sortOrder: _sort, ...category } = sequence;
    assert.equal((await ctx.api.put('/api/material-categories/SEQUENCE').set(admin()).send({ ...category, types: ['MATT', 'METAL'] })).status, 200);
    assert.equal((await ctx.api.put('/api/costing/type-rates/SEQUENCE/MATT').set(admin()).send({ basicRate: 8400, gstPercent: 0 })).status, 200);

    assert.equal((await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'COST-1', productName: 'Lehenga' })).status, 201);
    const sizes = [
      { size: '18', stitch: 5000, laser: 2000, consumption: { 'TST-BEAD': 10, CORD: 10 } },
      { size: '20', stitch: 10000, consumption: {} },
    ];
    assert.equal((await ctx.api.put('/api/designs/COST-1/components/KALI').set(admin()).send({ sizes })).status, 200);
  });
  after(async () => {
    await ctx.stop();
  });

  it('only the design costing permissions open it; only MANAGE can change it', async () => {
    assert.equal((await ctx.api.get('/api/design-costing').set(bearer(punching))).status, 403);
    assert.equal((await ctx.api.get(path).set(bearer(punching))).status, 403);
    assert.equal((await ctx.api.get(path).set(bearer(viewer))).status, 200);
    assert.equal((await ctx.api.put(path).set(bearer(viewer)).send(empty)).status, 403);
    const list = await ctx.api.get('/api/design-costing').query({ q: 'cost1' }).set(bearer(viewer));
    assert.deepEqual(list.body.map((d: { designNo: string; savedAt: string | null }) => [d.designNo, d.savedAt]), [['COST-1', null]]);
  });

  it('starts with the punching details, 7% discount and no rates; missing entries are reported', async () => {
    const res = await ctx.api.get(path).set(bearer(manager));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.saved.discountPercent, 7);
    assert.equal(Number(res.body.calculation.markupPercent).toFixed(2), '7.53');
    assert.equal(res.body.design.components[0].sizes[0].stitch, 5000);
    assert.deepEqual(res.body.cords.map((c: { key: string }) => c.key), ['CORD']);
    assert.equal(res.body.calculation.components[0].sizes[0].stitchCost, '0');
    const errors = res.body.calculation.errors as string[];
    assert.ok(errors.includes('2 sizes have no stitch rate yet (counted as ₹0).'), errors.join());
    assert.ok(errors.includes('1 size has no laser rate yet (counted as ₹0).'), errors.join());
    assert.ok(errors.some((e) => e.startsWith('CORD: enter the denier')), errors.join());
  });

  it('a preview calculates the entries without saving them', async () => {
    const res = await ctx.api
      .post(`${path}/preview`)
      .set(bearer(manager))
      .send({ ...empty, rows: [kali18], cords: { CORD: { denier: 9000, ratePerUnit: 100 } } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const size = res.body.components[0].sizes[0];
    // Stitch 5000 ÷ 1000 × 4 = 20; laser 2000 ÷ 1000 × 5 = 10; beads 10 × ₹1 + cord 10 m × 0.001 KG × ₹100 = 11.
    assert.deepEqual([size.stitchCost, size.laserCost, size.materialCost, size.base], ['20', '10', '11', '41']);
    assert.equal(size.finalPrice, '41');
    assert.equal(size.discount, undefined);
    assert.equal(size.net, undefined);
    assert.equal(await DesignCostingModel.countDocuments(), 0);
  });

  it('saves rates and discount with the design; totals are per component and overall; Material Master gets no rate', async () => {
    const before = await MaterialRateModel.countDocuments();
    const body = {
      discountPercent: 20,
      rows: [kali18, { component: 'KALI', size: '20', stitchRate: 2, laserRate: null }, { component: 'GONE', size: '1', stitchRate: 1, laserRate: null }],
      types: {},
      cords: { CORD: { denier: 9000, ratePerUnit: 100 } },
    };
    const res = await ctx.api.put(path).set(bearer(manager)).send(body);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.savedBy, 'manager@example.com');
    assert.equal(res.body.saved.rows.length, 2, 'rows of unknown sizes are dropped');
    assert.equal(res.body.saved.rows[0].note, 'Rush job - check with Ramesh');
    // Each material's cost per piece, per size and per component; they add up to the material cost.
    const kali = res.body.calculation.components[0];
    assert.deepEqual(kali.sizes[0].materials, { CORD: '1', 'TST-BEAD': '10' });
    assert.equal(kali.sizes[0].materialCost, '11');
    assert.deepEqual(kali.sizes[1].materials, {});
    assert.deepEqual(kali.materials, { CORD: '1', 'TST-BEAD': '10' });
    assert.equal(res.body.saved.rows[1].note, '');
    // One piece of every size, in Material Master order (the test bead was added last).
    type Material = { key: string; unit: string; qty: string; cost: string | null };
    assert.deepEqual(res.body.calculation.materials.map((m: Material) => [m.key, m.unit, m.qty, m.cost]), [['CORD', 'MTR', '10', '1'], ['TST-BEAD', 'PCS', '10', '10']]);
    assert.deepEqual(res.body.calculation.errors, []);
    const component = res.body.calculation.components[0];
    assert.equal(component.total.base, '61'); // 41 + (10,000 ÷ 1000 × 2)
    // 61 ÷ (1 − 20%) = 76.25; markup 15.25 (25% of the base).
    assert.equal(component.total.markup, '15.25');
    assert.equal(component.total.finalPrice, '76.25');
    assert.equal(res.body.calculation.total.finalPrice, '76.25');
    assert.equal(res.body.calculation.markupPercent, '25');
    assert.equal(await MaterialRateModel.countDocuments(), before);

    // Editable: any saved discount stays, including 0 (then no markup).
    const zero = await ctx.api.put(path).set(bearer(manager)).send({ ...body, discountPercent: 0 });
    assert.equal(zero.body.saved.discountPercent, 0);
    assert.equal(zero.body.calculation.total.markup, '0');
    assert.equal((await ctx.api.put(path).set(bearer(manager)).send(body)).status, 200);

    const again = await ctx.api.get(path).set(bearer(viewer));
    assert.equal(again.body.saved.discountPercent, 20);
    assert.deepEqual(again.body.saved.cords, { CORD: { denier: 9000, ratePerUnit: 100 } });
    assert.notEqual((await ctx.api.get('/api/design-costing').query({ q: 'COST-1' }).set(bearer(viewer))).body[0].savedAt, null);
  });

  it('the Manager edits punching details: the design and the costing follow, the saved rates stay', async () => {
    const sizes = [
      { size: '18', stitch: 6000, laser: 2000, consumption: { 'TST-BEAD': 10, CORD: 10 } },
      { size: '20', stitch: 10000, consumption: {} },
    ];
    assert.equal((await ctx.api.put(`${path}/components/KALI`).set(bearer(viewer)).send({ sizes })).status, 403);
    const res = await ctx.api.put(`${path}/components/KALI`).set(bearer(manager)).send({ sizes });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await ctx.api.get('/api/designs/COST-1').set(bearer(punching))).body.components[0].sizes[0].stitch, 6000);
    const costing = (await ctx.api.get(path).set(bearer(manager))).body;
    assert.equal(costing.calculation.components[0].sizes[0].stitchCost, '24');
    assert.equal(costing.saved.rows.length, 2);
  });

  it('heads default to 1, are saved per size and flow into base cost, markup and final price', async () => {
    const fresh = (await ctx.api.get(path).set(bearer(manager))).body;
    assert.equal(fresh.saved.rows[0].stitchHeads, 1);
    assert.equal(fresh.saved.rows[0].laserHeads, 1);

    const rows = [{ ...kali18, stitchHeads: 2, laserHeads: 1.5 }, { component: 'KALI', size: '20', stitchRate: null, laserRate: null, stitchHeads: 3, laserHeads: 1 }];
    const body = { ...empty, discountPercent: 20, rows, cords: { CORD: { denier: 9000, ratePerUnit: 100 } } };
    const saved = await ctx.api.put(path).set(bearer(manager)).send(body);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const size = saved.body.calculation.components[0].sizes[0];
    // Stitch 6000 (set by the test above) ÷ 1000 × 4 × 2 = 48; laser 2000 ÷ 1000 × 5 × 1.5 = 15; material 11.
    assert.deepEqual([size.stitchCost, size.laserCost, size.base, size.markup, size.finalPrice], ['48', '15', '74', '18.5', '92.5']);
    assert.equal(saved.body.saved.rows.length, 2, 'a size with only heads is kept');
    const again = (await ctx.api.get(path).set(bearer(viewer))).body;
    assert.deepEqual([again.saved.rows[0].stitchHeads, again.saved.rows[0].laserHeads, again.saved.rows[1].stitchHeads], [2, 1.5, 3]);

    const bad = { ...body, rows: [{ ...kali18, stitchHeads: -1 }] };
    assert.equal((await ctx.api.put(path).set(bearer(manager)).send(bad)).status, 400);
    assert.equal((await ctx.api.post(`${path}/preview`).set(bearer(manager)).send(bad)).status, 400);
  });

  it('a size with only remarks is kept; remarks that are too long are refused', async () => {
    const onlyNote = { component: 'KALI', size: '20', stitchRate: null, laserRate: null, note: 'Sample approved' };
    const saved = await ctx.api.put(path).set(bearer(manager)).send({ ...empty, rows: [kali18, onlyNote], cords: { CORD: { denier: 9000, ratePerUnit: 100 } }, discountPercent: 20 });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.saved.rows.find((r: { size: string }) => r.size === '20').note, 'Sample approved');
    assert.equal((await ctx.api.put(path).set(bearer(manager)).send({ ...empty, rows: [{ ...onlyNote, note: 'x'.repeat(201) }] })).status, 400);
  });

  it('a record saved with a markup % reads it as the discount; the next save stores the discount; old job rates change nothing', async () => {
    const baseBefore = (await ctx.api.get(path).set(bearer(manager))).body.calculation.total.base;
    await DesignCostingModel.collection.updateOne({ designNo: 'COST-1' }, { $set: { markupPercent: 7, 'rows.0.jobRate': 50 }, $unset: { discountPercent: '' } });
    const costing = (await ctx.api.get(path).set(bearer(manager))).body;
    assert.equal(costing.saved.discountPercent, 7);
    assert.equal(costing.saved.markupPercent, undefined);
    assert.equal(costing.saved.rows[0].jobRate, undefined);
    assert.equal(costing.calculation.total.base, baseBefore);
    const base = new Decimal(costing.calculation.total.base);
    assert.equal(new Decimal(costing.calculation.total.finalPrice).toDecimalPlaces(4).toString(), base.dividedBy(0.93).toDecimalPlaces(4).toString());
    const { discountPercent, rows, types, cords } = costing.saved;
    assert.equal((await ctx.api.put(path).set(bearer(manager)).send({ discountPercent, rows, types, cords })).status, 200);
    const stored = await DesignCostingModel.collection.findOne({ designNo: 'COST-1' });
    assert.deepEqual([stored?.discountPercent, stored?.markupPercent, stored?.rows[0].jobRate], [7, undefined, undefined]);
  });

  it('a typed colour is costed with the type chosen here; unknown types and a bad discount are refused', async () => {
    const sizes = [{ size: '18', stitch: 0, consumption: { 'SEQ-3MM|PINK': 1000 } }];
    assert.equal((await ctx.api.put(`${path}/components/BLOUSE`).set(bearer(manager)).send({ sizes })).status, 200);
    const rows: unknown[] = [];
    const none = await ctx.api.post(`${path}/preview`).set(bearer(manager)).send({ ...empty, rows });
    assert.ok((none.body.errors as string[]).some((e) => e.includes('choose the Sequence type')), none.body.errors.join());
    const matt = await ctx.api.post(`${path}/preview`).set(bearer(manager)).send({ ...empty, rows, types: { 'SEQ-3MM|PINK': 'MATT' } });
    const blouse = matt.body.components.find((c: { name: string }) => c.name === 'BLOUSE');
    assert.ok(Number(blouse.sizes[0].materialCost) > 0);

    const bad = await ctx.api.put(path).set(bearer(manager)).send({ ...empty, types: { 'SEQ-3MM|PINK': 'PLASTIC' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'PLASTIC is not a Sequence type.');
    for (const discountPercent of [-1, 100, 150]) {
      assert.equal((await ctx.api.post(`${path}/preview`).set(bearer(manager)).send({ ...empty, discountPercent })).status, 400, String(discountPercent));
    }  });

  it('a save is recorded in the audit log; the record follows a renumbered design and goes with a deleted one', async () => {
    const history = await ctx.api.get('/api/audit-logs/entity/DesignCosting/COST-1').set(admin());
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.ok(JSON.stringify(history.body).includes('DESIGN_COSTING_SAVED'));

    assert.equal((await ctx.api.patch('/api/designs/COST-1').set(admin()).send({ designNo: 'COST-2' })).status, 200);
    assert.equal((await ctx.api.get('/api/design-costing/COST-2').set(bearer(manager))).status, 200);
    assert.equal(await DesignCostingModel.countDocuments({ designNo: 'COST-2' }), 1);
    assert.equal((await ctx.api.delete('/api/designs/COST-2').set(admin())).status, 204);
    assert.equal(await DesignCostingModel.countDocuments({ designNo: 'COST-2' }), 0);
  });
});
