import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { seedMaterials, type StandardMaterial } from '../src/db/seed.js';
import { bearer, startTestApp, type TestContext } from './helpers.js';
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
      .send({ code: 'SEQ-3MM', name: 'My 3mm', category: 'SEQUENCE', seqPerCd: 1, cdPerRoll: 1 });
    assert.equal(own.status, 201);

    const standard = fixture.materials as unknown as StandardMaterial[];
    const log = await seedMaterials(standard);
    assert.equal(log.filter((l) => l.endsWith('created')).length, 10);

    const list = (await ctx.api.get('/api/materials').set(bearer(ctx.adminToken))).body as { code: string; name: string; seqPerCd: number }[];
    assert.equal(list.length, 11);
    assert.deepEqual([list[0]!.code, list[0]!.name, list[0]!.seqPerCd], ['SEQ-3MM', 'My 3mm', 1]);
    assert.equal(list[1]!.code, 'SEQ-4MM');

    const again = await seedMaterials(standard);
    assert.ok(again.every((l) => l.includes('exists')));
  });
});
