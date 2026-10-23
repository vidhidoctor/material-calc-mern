import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { seedComponentNames } from '../src/modules/component-names/component-names.service.js';
import { loadFixture } from './fixture.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';

type Entry = { name: string; designCount: number };
const names = (body: Entry[]) => body.map((e) => e.name);

/** Punching's "Component" dropdown: a list managed in Material Master; names typed under "Other…" join it. */
describe('component list', () => {
  let ctx: TestContext;
  let punching: string;
  const admin = () => bearer(ctx.adminToken);

  before(async () => {
    ctx = await startTestApp();
    punching = (await createActiveUser(ctx, { email: 'punch@example.com', roleName: 'Punching Employee' })).token;
  });
  after(async () => {
    await ctx.stop();
  });

  it('starts with the default components; Punching can read the list', async () => {
    const res = await ctx.api.get('/api/component-names').set(bearer(punching));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(names(res.body), ['FROCK', 'KALI', 'BLOUSE', 'BELT', 'GALISH']);
    // Seeded once only.
    assert.equal(await seedComponentNames(), 0);
  });

  it('Admin adds (upper-cased, at the end) and removes names; duplicates and bad names are refused', async () => {
    const added = await ctx.api.post('/api/component-names').set(admin()).send({ name: ' dupatta ' });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    assert.equal(names(added.body).at(-1), 'DUPATTA');
    assert.equal((await ctx.api.post('/api/component-names').set(admin()).send({ name: 'Dupatta' })).status, 409);
    assert.equal((await ctx.api.post('/api/component-names').set(admin()).send({ name: '' })).status, 400);

    const removed = await ctx.api.delete('/api/component-names/FROCK').set(admin());
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(names(removed.body).includes('FROCK'), false);
    assert.equal((await ctx.api.delete('/api/component-names/FROCK').set(admin())).status, 404);
  });

  it('only Material Master managers can change the list', async () => {
    assert.equal((await ctx.api.post('/api/component-names').set(bearer(punching)).send({ name: 'SLEEVE' })).status, 403);
    assert.equal((await ctx.api.delete('/api/component-names/KALI').set(bearer(punching))).status, 403);
  });

  it('a name typed in Punching joins the list; removing a name keeps the designs that use it', async () => {
    await loadFixture(ctx.api, ctx.adminToken);
    const put = await ctx.api
      .put('/api/designs/26-49/components/ANARKALI')
      .set(admin())
      .send({ sizes: [{ size: '18', stitch: 1, consumption: { 'SEQ-3MM': 10 } }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));

    const list = (await ctx.api.get('/api/component-names').set(admin())).body as Entry[];
    assert.equal(names(list).at(-1), 'ANARKALI');
    assert.equal(list.find((e) => e.name === 'ANARKALI')!.designCount, 1);
    assert.equal(list.find((e) => e.name === 'KALI')!.designCount, 1);

    await ctx.api.delete('/api/component-names/ANARKALI').set(admin());
    const design = (await ctx.api.get('/api/designs/26-49').set(admin())).body;
    assert.ok(design.components.some((c: { name: string }) => c.name === 'ANARKALI'));
  });
});
