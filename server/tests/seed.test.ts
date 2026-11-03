import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { seedFoundation, seedMaterials, type StandardMaterial } from '../src/db/seed.js';
import { RoleModel } from '../src/modules/roles/role.model.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';
import { fixture } from './fixture.js';

describe('seed:materials (optional standard materials)', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await startTestApp();
  });
  after(async () => {
    await ctx.stop();
  });

  it('adds missing standard materials after existing ones and never changes existing ones', async () => {
    const own = await ctx.api
      .post('/api/materials')
      .set(bearer(ctx.adminToken))
      .send({ code: 'SEQ-3MM', name: 'My 3mm', category: 'SEQUENCE', rules: { seqPerCd: 1, cdPerRoll: 1 } });
    assert.equal(own.status, 201);

    const standard = fixture.materials as unknown as StandardMaterial[];
    const log = await seedMaterials(standard);
    assert.equal(log.filter((l) => l.endsWith('created')).length, 10);

    const list = (await ctx.api.get('/api/materials').set(bearer(ctx.adminToken))).body as { code: string; name: string; rules: Record<string, number> }[];
    assert.equal(list.length, 11);
    assert.deepEqual([list[0]!.code, list[0]!.name, list[0]!.rules.seqPerCd], ['SEQ-3MM', 'My 3mm', 1]);
    assert.equal(list[1]!.code, 'SEQ-4MM');

    const again = await seedMaterials(standard);
    assert.ok(again.every((l) => l.includes('exists')));
  });
});

describe('Production head role', () => {
  let ctx: TestContext;
  const seed = () => seedFoundation({ adminEmail: 'admin@example.com', adminPassword: 'Password#1' });

  before(async () => {
    ctx = await startTestApp();
  });
  after(async () => {
    await ctx.stop();
  });

  it('exists by default and can manage Design Costing, and nothing else', async () => {
    const role = await RoleModel.findOne({ name: 'Production head' }).lean();
    assert.deepEqual(role?.permissions, ['DESIGN_COSTING_VIEW', 'DESIGN_COSTING_MANAGE']);

    const { token } = await createActiveUser(ctx, { email: 'head@example.com', roleName: 'Production head' });
    assert.equal((await ctx.api.get('/api/design-costing').set(bearer(token))).status, 200);
    assert.equal((await ctx.api.put('/api/print-config/rate-costing').set(bearer(token)).send({ columns: ['size'], totals: false })).status, 200);
    assert.equal((await ctx.api.get('/api/orders').set(bearer(token))).status, 403);
    assert.equal((await ctx.api.get('/api/designs').set(bearer(token))).status, 403);
    assert.equal((await ctx.api.get('/api/admin/users').set(bearer(token))).status, 403);
  });

  it('a restart keeps what Admin changed on it', async () => {
    await RoleModel.updateOne({ name: 'Production head' }, { $set: { permissions: ['DESIGN_COSTING_VIEW'] } });
    await seed();
    assert.deepEqual((await RoleModel.findOne({ name: 'Production head' }).lean())?.permissions, ['DESIGN_COSTING_VIEW']);
  });

  it('a role already named with other capitals is not a clash: the server still starts, and that role stays', async () => {
    await RoleModel.updateOne({ name: 'Production head' }, { $set: { name: 'PRODUCTION HEAD', permissions: ['PRODUCTION_VIEW'] } });
    await seed();
    const matching = await RoleModel.find({ name: /^production head$/i }).lean();
    assert.deepEqual(matching.map((r) => [r.name, r.permissions]), [['PRODUCTION HEAD', ['PRODUCTION_VIEW']]]);
  });
});
