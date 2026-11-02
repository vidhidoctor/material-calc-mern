import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Decimal } from '../src/calculation/engine.js';
import { jobWorkCost, sumJobWork } from '../src/calculation/job-work.js';
import { MaterialRateModel } from '../src/modules/costing/material-rate.model.js';
import { JobWorkCostingModel } from '../src/modules/job-work-costing/job-work-costing.model.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';
import { loadFixture } from './fixture.js';

describe('job work costing maths', () => {
  const blank = { rate: null, stitch: 0, laser: null, stitchRate: null, laserRate: null, stitchHeads: 1, laserHeads: 1, includedMaterials: new Decimal(0), excludedMaterials: new Decimal(0) };

  it('final cost = rate + included materials; excluded materials are never added', () => {
    const c = jobWorkCost({ ...blank, rate: 75, includedMaterials: new Decimal(10), excludedMaterials: new Decimal(25) });
    assert.equal(c.finalCost.toString(), '85');
    assert.equal(c.excludedMaterials.toString(), '25');
    assert.equal(jobWorkCost({ ...blank, includedMaterials: new Decimal(10) }).finalCost.toString(), '10');
    const total = sumJobWork([c, c]);
    assert.deepEqual([total.rate.toString(), total.includedMaterials.toString(), total.excludedMaterials.toString(), total.finalCost.toString()], ['150', '20', '50', '170']);
  });

  it('stitch and laser cost use quantity ÷ 1000 × rate × heads, and join the final cost', () => {
    const c = jobWorkCost({ ...blank, rate: 75, stitch: 5000, stitchRate: 4, stitchHeads: 2, laser: 2000, laserRate: 5, laserHeads: 1.5, includedMaterials: new Decimal(10) });
    assert.deepEqual([c.stitchCost.toString(), c.laserCost.toString(), c.finalCost.toString()], ['40', '15', '140']);
    const total = sumJobWork([c, c]);
    assert.deepEqual([total.stitchCost.toString(), total.laserCost.toString(), total.finalCost.toString()], ['80', '30', '280']);
  });
});

describe('job work costing API', () => {
  let ctx: TestContext;
  let manager: string;
  let viewer: string;
  let punching: string;
  const admin = () => bearer(ctx.adminToken);
  const path = '/api/job-work-costing/JW-1';
  const costingPath = '/api/design-costing/JW-1';
  const rows = [
    { component: 'KALI', size: '18', rate: 75 },
    { component: 'KALI', size: '20', rate: 80 },
    { component: 'BELT', size: 'ALL', rate: null },
  ];

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

    // ₹1 per piece of each test bead: 1,000 pieces per KG at ₹1,000 per KG.
    for (const code of ['JW-BEAD', 'JW-METAL']) {
      assert.equal((await ctx.api.post('/api/materials').set(admin()).send({ code, name: code, category: 'BEAD', rules: { pcsPerKg: 1000 } })).status, 201);
      assert.equal((await ctx.api.put(`/api/costing/rates/${code}`).set(admin()).send({ basicRate: 1000, gstPercent: 0 })).status, 200);
    }
    assert.equal((await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'JW-1', productName: 'Lehenga' })).status, 201);
    const kali = [
      { size: '18', stitch: 5000, laser: 2000, consumption: { 'JW-BEAD': 10, 'JW-METAL': 25 } },
      { size: '20', stitch: 6000, consumption: { 'JW-BEAD': 12, 'JW-METAL': 30 } },
    ];
    assert.equal((await ctx.api.put('/api/designs/JW-1/components/KALI').set(admin()).send({ sizes: kali })).status, 200);
    assert.equal((await ctx.api.put('/api/designs/JW-1/components/BELT').set(admin()).send({ sizes: [{ size: 'ALL', stitch: 100, consumption: { 'JW-BEAD': 5 } }] })).status, 200);
  });
  after(async () => {
    await ctx.stop();
  });

  it('only the costing permissions open it; only MANAGE can save', async () => {
    assert.equal((await ctx.api.get(path).set(bearer(punching))).status, 403);
    assert.equal((await ctx.api.get(path).set(bearer(viewer))).status, 200);
    assert.equal((await ctx.api.put(path).set(bearer(viewer)).send({ rows, excluded: [] })).status, 403);
  });

  it('starts from the punching details with every material included and no rates', async () => {
    const res = await ctx.api.get(path).set(bearer(manager));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { calculation } = res.body;
    assert.deepEqual(calculation.components.map((c: { name: string }) => c.name), ['KALI', 'BELT']);
    assert.equal(calculation.components[0].sizes[0].stitch, 5000);
    assert.deepEqual(calculation.materials.map((m: { key: string; qty: string; cost: string; included: boolean }) => [m.key, m.qty, m.cost, m.included]), [['JW-BEAD', '27', '27', true], ['JW-METAL', '55', '55', true]]);
    assert.equal(calculation.total.finalCost, '82');
    assert.ok(calculation.errors.includes('3 sizes have no job worker, stitch or laser rate yet (counted as ₹0).'), calculation.errors.join());
  });

  it('a preview calculates without saving: ₹75 agreed, an excluded material is not double counted', async () => {
    const res = await ctx.api.post(`${path}/preview`).set(bearer(manager)).send({ rows, excluded: ['JW-METAL'] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const size = res.body.components[0].sizes[0];
    assert.deepEqual([size.rate, size.includedMaterials, size.excludedMaterials, size.finalCost], ['75', '10', '25', '85']);
    assert.equal(await JobWorkCostingModel.countDocuments(), 0);
  });

  it('saves rates and material choices; totals per component and overall', async () => {
    const res = await ctx.api.put(path).set(bearer(manager)).send({ rows: [...rows, { component: 'GONE', size: '1', rate: 5 }], excluded: ['JW-METAL'] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.savedBy, 'manager@example.com');
    assert.deepEqual(res.body.saved.rows.map((r: { size: string }) => r.size), ['18', '20'], 'blank rates and unknown sizes are dropped');
    assert.deepEqual(res.body.saved.excluded, ['JW-METAL']);
    const [kali, belt] = res.body.calculation.components;
    assert.deepEqual([kali.total.rate, kali.total.includedMaterials, kali.total.excludedMaterials, kali.total.finalCost], ['155', '22', '55', '177']);
    assert.deepEqual([belt.total.rate, belt.total.finalCost], ['0', '5']);
    assert.deepEqual([res.body.calculation.total.rate, res.body.calculation.total.finalCost], ['155', '182']);
    assert.equal(res.body.calculation.materials[1].included, false);
    const again = (await ctx.api.get(path).set(bearer(viewer))).body;
    assert.deepEqual(again.saved.excluded, ['JW-METAL']);
  });

  it('never touches the design costing or Material Master, and the other way round', async () => {
    const costing = { markupPercent: 12, rows: [{ component: 'KALI', size: '18', stitchRate: 4, laserRate: 5, note: 'Own costing' }], types: {}, cords: {} };
    assert.equal((await ctx.api.put(costingPath).set(bearer(manager)).send(costing)).status, 200);
    const before = (await ctx.api.get(costingPath).set(bearer(manager))).body;
    const rates = await MaterialRateModel.find().lean();
    const stripId = (list: typeof rates) => list.map(({ key, basicRate, gstPercent }) => ({ key, basicRate, gstPercent }));

    assert.equal((await ctx.api.put(path).set(bearer(manager)).send({ rows: [{ component: 'KALI', size: '18', rate: 999 }], excluded: ['JW-BEAD'] })).status, 200);
    const after = (await ctx.api.get(costingPath).set(bearer(manager))).body;
    assert.deepEqual(after.saved, before.saved);
    assert.deepEqual(after.calculation, before.calculation);
    assert.equal(after.savedAt, before.savedAt);
    assert.deepEqual(stripId(await MaterialRateModel.find().lean()), stripId(rates));

    // Saving the design costing leaves the job work rates alone.
    assert.equal((await ctx.api.put(costingPath).set(bearer(manager)).send({ ...costing, markupPercent: 50 })).status, 200);
    const jobWork = (await ctx.api.get(path).set(bearer(manager))).body;
    assert.equal(jobWork.saved.rows.length, 1);
    assert.equal(jobWork.saved.rows[0].rate, 999);
    assert.deepEqual(jobWork.saved.excluded, ['JW-BEAD']);
  });

  it('stitch and laser quantities, rates and heads are per size; typed quantities never change the Punching Master or the design costing', async () => {
    const punchingBefore = (await ctx.api.get('/api/designs/JW-1').set(bearer(punching))).body.components;
    const costingBefore = (await ctx.api.get(costingPath).set(bearer(manager))).body;
    const entries = [
      { component: 'KALI', size: '18', rate: 75, stitch: 8000, laser: 3000, stitchRate: 4, stitchHeads: 2, laserRate: 5, laserHeads: 1.5 },
      { component: 'KALI', size: '20', stitchRate: 4 }, // Follows the Punching Master: 6,000 stitches; heads default to 1.
      { component: 'BELT', size: 'ALL', laser: 500, laserRate: 2 }, // Laser the Punching Master does not have.
    ];
    const saved = await ctx.api.put(path).set(bearer(manager)).send({ rows: entries, excluded: ['JW-BEAD', 'JW-METAL'] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const [kali, belt] = saved.body.calculation.components;
    const [s18, s20] = kali.sizes;
    // 8,000 ÷ 1000 × 4 × 2 = 64; 3,000 ÷ 1000 × 5 × 1.5 = 22.5; + rate 75.
    assert.deepEqual([s18.stitch, s18.laser, s18.punchingStitch, s18.punchingLaser], [8000, 3000, 5000, 2000]);
    assert.deepEqual([s18.stitchCost, s18.laserCost, s18.finalCost], ['64', '22.5', '161.5']);
    assert.deepEqual([s20.stitch, s20.stitchCost, s20.laserCost, s20.finalCost], [6000, '24', '0', '24']);
    assert.deepEqual([belt.sizes[0].laser, belt.sizes[0].punchingLaser, belt.sizes[0].laserCost], [500, null, '1']);
    assert.deepEqual([kali.total.stitchCost, kali.total.laserCost, kali.total.finalCost], ['88', '22.5', '185.5']);
    assert.equal(saved.body.calculation.total.finalCost, '186.5');

    const again = (await ctx.api.get(path).set(bearer(viewer))).body;
    assert.deepEqual([again.saved.rows[0].stitch, again.saved.rows[0].stitchHeads, again.saved.rows[1].stitch, again.saved.rows[1].stitchHeads], [8000, 2, null, 1]);

    assert.deepEqual((await ctx.api.get('/api/designs/JW-1').set(bearer(punching))).body.components, punchingBefore);
    const costingAfter = (await ctx.api.get(costingPath).set(bearer(manager))).body;
    assert.deepEqual(costingAfter.saved, costingBefore.saved);
    assert.deepEqual(costingAfter.calculation, costingBefore.calculation);

    // Blank row: dropped on save, back to the Punching Master. Bad values are refused.
    const cleared = await ctx.api.put(path).set(bearer(manager)).send({ rows: [{ component: 'KALI', size: '18', rate: 999 }], excluded: ['JW-BEAD'] });
    assert.equal(cleared.body.calculation.components[0].sizes[0].stitch, 5000);
    assert.equal(cleared.body.saved.rows.length, 1);
    for (const bad of [{ stitch: 1.5 }, { laser: -1 }, { stitchHeads: -1 }, { laserRate: -1 }]) {
      assert.equal((await ctx.api.post(`${path}/preview`).set(bearer(manager)).send({ rows: [{ component: 'KALI', size: '18', ...bad }], excluded: [] })).status, 400, JSON.stringify(bad));
    }
  });

  it('a record saved before stitch and laser were added still loads with its rate', async () => {
    await JobWorkCostingModel.collection.updateOne({ designNo: 'JW-1' }, { $set: { rows: [{ component: 'KALI', size: '18', rate: 999 }] } });
    const old = (await ctx.api.get(path).set(bearer(manager))).body;
    assert.deepEqual(old.saved.rows[0], { component: 'KALI', size: '18', rate: 999, stitch: null, laser: null, stitchRate: null, laserRate: null, stitchHeads: 1, laserHeads: 1 });
    assert.equal(old.calculation.components[0].sizes[0].stitchCost, '0');
  });

  it('follows punching edits; a material added later starts included', async () => {
    assert.equal((await ctx.api.post('/api/materials').set(admin()).send({ code: 'JW-NEW', name: 'New', category: 'BEAD', rules: { pcsPerKg: 1000 } })).status, 201);
    await ctx.api.put('/api/costing/rates/JW-NEW').set(admin()).send({ basicRate: 2000, gstPercent: 0 });
    assert.equal((await ctx.api.put('/api/designs/JW-1/components/BELT').set(admin()).send({ sizes: [{ size: 'ALL', stitch: 100, consumption: { 'JW-BEAD': 5, 'JW-NEW': 3 } }] })).status, 200);
    const { calculation } = (await ctx.api.get(path).set(bearer(manager))).body;
    const added = calculation.materials.find((m: { key: string }) => m.key === 'JW-NEW');
    assert.deepEqual([added.cost, added.included], ['6', true]);
    assert.equal(calculation.components[1].sizes[0].includedMaterials, '6');
    assert.equal(calculation.components[1].sizes[0].excludedMaterials, '5');
  });

  it('bad entries are refused; a save is audited; the record follows a renumbered design and goes with a deleted one', async () => {
    assert.equal((await ctx.api.put(path).set(bearer(manager)).send({ rows: [{ component: 'KALI', size: '18', rate: -1 }], excluded: [] })).status, 400);
    assert.equal((await ctx.api.post(`${path}/preview`).set(bearer(manager)).send({ rows: 'x', excluded: [] })).status, 400);
    const history = await ctx.api.get('/api/audit-logs/entity/JobWorkCosting/JW-1').set(admin());
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.ok(JSON.stringify(history.body).includes('JOB_WORK_COSTING_SAVED'));

    assert.equal((await ctx.api.patch('/api/designs/JW-1').set(admin()).send({ designNo: 'JW-2' })).status, 200);
    assert.equal(await JobWorkCostingModel.countDocuments({ designNo: 'JW-2' }), 1);
    assert.equal((await ctx.api.get('/api/job-work-costing/JW-2').set(bearer(manager))).body.saved.rows[0].rate, 999);
    assert.equal((await ctx.api.delete('/api/designs/JW-2').set(admin())).status, 204);
    assert.equal(await JobWorkCostingModel.countDocuments(), 0);
  });
});
