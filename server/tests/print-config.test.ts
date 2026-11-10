import { PRINT_SHEETS } from '@app/shared';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';

describe('print configuration', () => {
  let ctx: TestContext;
  let manager: string;
  let viewer: string;
  let punching: string;
  const admin = () => bearer(ctx.adminToken);
  const rate = '/api/print-config/rate-costing';
  const job = '/api/print-config/job-work';

  const roleUser = async (email: string, roleName: string, permissions: string[]) => {
    assert.equal((await ctx.api.post('/api/admin/roles').set(admin()).send({ name: roleName, permissions })).status, 201);
    return (await createActiveUser(ctx, { email, roleName })).token;
  };

  before(async () => {
    ctx = await startTestApp();
    manager = await roleUser('manager@example.com', 'Manager', ['DESIGN_COSTING_VIEW', 'DESIGN_COSTING_MANAGE']);
    viewer = await roleUser('viewer@example.com', 'Costing Viewer', ['DESIGN_COSTING_VIEW']);
    punching = (await createActiveUser(ctx, { email: 'punch@example.com', roleName: 'Punching Employee', departmentName: 'Punching' })).token;
  });
  after(async () => {
    await ctx.stop();
  });

  it('starts from each sheet\'s defaults, for anyone who can print', async () => {
    const rateConfig = (await ctx.api.get(rate).set(bearer(viewer))).body;
    assert.deepEqual([rateConfig.columns, rateConfig.totals, rateConfig.materials, rateConfig.savedAt], [[...PRINT_SHEETS['rate-costing'].columns], true, [], null]);
    assert.ok(['markup', 'finalPrice', 'remarks'].every((c) => rateConfig.columns.includes(c)), 'the pricing columns are on the rate sheet');
    assert.ok(PRINT_SHEETS['job-work'].columns.includes('remarks'), 'the job work sheet offers Remarks');
    const jobConfig = (await ctx.api.get(job).set(bearer(viewer))).body;
    assert.deepEqual([jobConfig.columns, jobConfig.totals], [['size', 'final'], false]);
  });

  it('only Managers and Admins can change it; others only read; people without costing access neither', async () => {
    const body = { columns: ['size'], totals: false };
    assert.equal((await ctx.api.put(rate).set(bearer(viewer)).send(body)).status, 403);
    assert.equal((await ctx.api.put(rate).set(bearer(punching)).send(body)).status, 403);
    assert.equal((await ctx.api.get(rate).set(bearer(punching))).status, 403);
    assert.equal((await ctx.api.get(rate)).status, 401);
    assert.equal((await ctx.api.put(rate).set(admin()).send(body)).status, 200);
    assert.equal((await ctx.api.put(rate).set(bearer(manager)).send(body)).status, 200);
  });

  it('a save applies to everyone from then on, in table order, and stays until changed', async () => {
    const saved = await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['base', 'size', 'stitchCost'], totals: false });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.columns, ['size', 'stitchCost', 'base']);
    assert.equal(saved.body.savedBy, 'manager@example.com');
    const read = (await ctx.api.get(rate).set(bearer(viewer))).body;
    assert.deepEqual([read.columns, read.totals, read.savedBy], [['size', 'stitchCost', 'base'], false, 'manager@example.com']);
    assert.notEqual(read.savedAt, null);
    const changed = await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['size', 'base'], totals: true });
    assert.deepEqual([changed.body.columns, changed.body.totals], [['size', 'base'], true]);
  });

  it('the chosen materials are saved with the columns (colour by colour); none when not sent', async () => {
    const chosen = ['SEQ-3MM|WHITE', 'BEAD-2.5MM', 'SEQ-3MM|WHITE'];
    const on = await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['size', 'materialCost', 'finalPrice', 'remarks'], totals: true, materials: chosen });
    assert.deepEqual([on.body.columns, on.body.materials], [['size', 'materialCost', 'finalPrice', 'remarks'], ['SEQ-3MM|WHITE', 'BEAD-2.5MM']]);
    assert.deepEqual((await ctx.api.get(rate).set(bearer(viewer))).body.materials, ['SEQ-3MM|WHITE', 'BEAD-2.5MM']);
    const off = await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['size', 'base'], totals: true });
    assert.deepEqual(off.body.materials, []);
    for (const bad of ['yes', [''], [5]]) {
      assert.equal((await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['size'], totals: true, materials: bad })).status, 400, JSON.stringify(bad));
    }
  });

  it('the two sheets are saved separately', async () => {
    const before = (await ctx.api.get(rate).set(bearer(viewer))).body;
    assert.equal((await ctx.api.put(job).set(bearer(manager)).send({ columns: ['size', 'rate', 'final'], totals: true })).status, 200);
    assert.deepEqual((await ctx.api.get(rate).set(bearer(viewer))).body, before);
    assert.deepEqual((await ctx.api.get(job).set(bearer(viewer))).body.columns, ['size', 'rate', 'final']);
  });

  it('refuses no columns, unknown columns (including another sheet\'s) and unknown sheets', async () => {
    assert.equal((await ctx.api.put(rate).set(bearer(manager)).send({ columns: [], totals: true })).status, 400);
    const unknown = await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['size', 'nope'], totals: true });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, 'Unknown column nope.');
    assert.equal((await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['final'], totals: true })).status, 400);
    assert.equal((await ctx.api.put(rate).set(bearer(manager)).send({ columns: ['size'] })).status, 400);
    assert.equal((await ctx.api.get('/api/print-config/other').set(bearer(manager))).status, 400);
  });

  it('every save is in the audit log', async () => {
    const history = await ctx.api.get('/api/audit-logs/entity/PrintConfig/rate-costing').set(admin());
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.ok(JSON.stringify(history.body).includes('PRINT_CONFIG_SAVED'));
  });
});
