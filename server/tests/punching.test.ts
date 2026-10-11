import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';
import { loadFixture } from './fixture.js';

describe('materials and designs (Punching)', () => {
  let ctx: TestContext;
  let punching: string;
  let production: string;

  before(async () => {
    ctx = await startTestApp();
    await loadFixture(ctx.api, ctx.adminToken);
    punching = (await createActiveUser(ctx, { email: 'punch@example.com', roleName: 'Punching Employee', departmentName: 'Punching' })).token;
    production = (await createActiveUser(ctx, { email: 'prod@example.com', roleName: 'Production Employee' })).token;
  });
  after(async () => {
    await ctx.stop();
  });

  describe('permissions', () => {
    it('Production cannot edit designs', async () => {
      const res = await ctx.api.put('/api/designs/26-49/components/FROCK').set(bearer(production)).send({ sizes: [{ size: '18', stitch: 1 }] });
      assert.equal(res.status, 403);
      assert.equal((await ctx.api.post('/api/designs').set(bearer(production)).send({ designNo: 'X1', productName: 'X' })).status, 403);
    });

    it('Punching cannot see orders, purchase requirements or manage materials', async () => {
      assert.equal((await ctx.api.get('/api/orders').set(bearer(punching))).status, 403);
      assert.equal((await ctx.api.get('/api/purchase/requirements').set(bearer(punching))).status, 403);
      assert.equal((await ctx.api.get('/api/production/designs').set(bearer(punching))).status, 403);
      assert.equal((await ctx.api.post('/api/materials').set(bearer(punching)).send({ code: 'X', name: 'X', category: 'BEAD', rules: { pcsPerKg: 1 } })).status, 403);
    });

    it('Punching sees material columns on the design page', async () => {
      const res = await ctx.api.get('/api/designs/26-49').set(bearer(punching));
      assert.equal(res.status, 200);
      assert.equal(res.body.materials.length, 11);
      assert.deepEqual(res.body.materials[0], { code: 'SEQ-3MM', name: '3-MM Sequence', category: 'SEQUENCE', unit: 'PCS', typed: false });
      assert.equal(res.body.materials.at(-1).unit, 'MTR');
    });
  });

  describe('design + components flow', () => {
    it('creates a design (upper-cased) and refuses a duplicate', async () => {
      const res = await ctx.api.post('/api/designs').set(bearer(punching)).send({ designNo: ' 30-01 ', productName: 'Lehenga Choli' });
      assert.equal(res.status, 201);
      assert.equal(res.body.designNo, '30-01');
      assert.equal(res.body.productName, 'LEHENGA CHOLI');
      assert.deepEqual(res.body.components, []);
      const dup = await ctx.api.post('/api/designs').set(bearer(punching)).send({ designNo: '30-01', productName: 'X' });
      assert.equal(dup.status, 409);
      assert.equal(dup.body.error, 'Design 30-01 already exists.');
    });

    it('adds two components; zeros are dropped, codes and sizes upper-cased', async () => {
      const kali = await ctx.api
        .put('/api/designs/30-01/components/kali')
        .set(bearer(punching))
        .send({
          sizes: [
            { size: '18', stitch: 1200, laser: 3, consumption: { 'seq-3mm': 100, CORD: 2.5, 'SEQ-4MM': 0 } },
            { size: '20', stitch: 1300, consumption: { 'SEQ-3MM': 110 } },
          ],
        });
      assert.equal(kali.status, 200, JSON.stringify(kali.body));
      const belt = await ctx.api
        .put('/api/designs/30-01/components/BELT')
        .set(bearer(punching))
        .send({ sizes: [{ size: 'all', stitch: 50, consumption: { CORD: 1 } }] });
      assert.equal(belt.status, 200);

      const design = (await ctx.api.get('/api/designs/30-01').set(bearer(punching))).body;
      assert.deepEqual(
        design.components.map((c: { name: string }) => c.name),
        ['KALI', 'BELT'],
      );
      assert.deepEqual(design.components[0].sizes[0], { size: '18', stitch: 1200, laser: 3, consumption: { 'SEQ-3MM': 100, CORD: 2.5 } });
      assert.equal(design.components[0].sizes[1].laser, null);
      assert.equal(design.components[1].sizes[0].size, 'ALL');
    });

    it('keeps the material columns chosen for a component (shared by its sizes)', async () => {
      const res = await ctx.api
        .put('/api/designs/30-01/components/GALISH')
        .set(bearer(punching))
        .send({
          columns: ['seq-4mm', 'SEQ-3MM'],
          sizes: [
            { size: '18', stitch: 10, consumption: { 'SEQ-3MM': 50 } },
            { size: '20', stitch: 12, consumption: { 'SEQ-3MM': 60, CORD: 2 } },
          ],
        });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const galish = res.body.components.find((c: { name: string }) => c.name === 'GALISH');
      // Chosen SEQ-4MM stays even without quantities; CORD has a quantity so it is added; Material Master order.
      assert.deepEqual(galish.columns, ['SEQ-3MM', 'SEQ-4MM', 'CORD']);

      const unknown = await ctx.api
        .put('/api/designs/30-01/components/GALISH')
        .set(bearer(punching))
        .send({ columns: ['NOPE'], sizes: [{ size: '18', stitch: 1 }] });
      assert.equal(unknown.body.error, 'Unknown material NOPE.');

      assert.equal((await ctx.api.delete('/api/designs/30-01/components/GALISH').set(bearer(punching))).status, 200);
    });

    it('a material can have colour variants, each its own column with its own quantity', async () => {
      const res = await ctx.api
        .put('/api/designs/30-01/components/BLOUSE')
        .set(bearer(punching))
        .send({
          columns: ['SEQ-3MM|white', 'SEQ-3MM|Light  Pink', 'SEQ-3MM|DARK PINK', 'CORD'],
          sizes: [
            { size: '18', stitch: 10, consumption: { 'SEQ-3MM|WHITE': 120, 'SEQ-3MM|LIGHT PINK': 80, 'SEQ-3MM|DARK PINK': 60 } },
            { size: '20', stitch: 12, consumption: { 'SEQ-3MM|WHITE': 130, CORD: 3 } },
          ],
        });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const blouse = res.body.components.find((c: { name: string }) => c.name === 'BLOUSE');
      assert.deepEqual(blouse.columns, ['SEQ-3MM|WHITE', 'SEQ-3MM|LIGHT PINK', 'SEQ-3MM|DARK PINK', 'CORD']);
      assert.deepEqual(blouse.sizes[0].consumption, { 'SEQ-3MM|WHITE': 120, 'SEQ-3MM|LIGHT PINK': 80, 'SEQ-3MM|DARK PINK': 60 });

      const bad = await ctx.api
        .put('/api/designs/30-01/components/BLOUSE')
        .set(bearer(punching))
        .send({ columns: ['SEQ-3MM|<script>'], sizes: [{ size: '18', stitch: 1 }] });
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /may only contain letters/);
      assert.equal((await ctx.api.delete('/api/designs/30-01/components/BLOUSE').set(bearer(punching))).status, 200);
    });

    it('components saved before column selection show the materials they use', async () => {
      const design = (await ctx.api.get('/api/designs/26-49').set(bearer(punching))).body;
      const belt = design.components.find((c: { name: string }) => c.name === 'BELT');
      assert.deepEqual(belt.columns, ['SEQ-3MM', 'CORD']);
    });

    it('replaces a component\'s sizes on save', async () => {
      const res = await ctx.api
        .put('/api/designs/30-01/components/BELT')
        .set(bearer(punching))
        .send({ sizes: [{ size: 'ALL', stitch: 60, consumption: { CORD: 2 } }] });
      assert.equal(res.status, 200);
      const belt = res.body.components.find((c: { name: string }) => c.name === 'BELT');
      assert.deepEqual(belt.sizes, [{ size: 'ALL', stitch: 60, laser: null, consumption: { CORD: 2 } }]);
    });

    it('edits the product name and removes an unused component', async () => {
      const renamed = await ctx.api.patch('/api/designs/30-01').set(bearer(punching)).send({ productName: 'choli' });
      assert.equal(renamed.body.productName, 'CHOLI');
      const removed = await ctx.api.delete('/api/designs/30-01/components/BELT').set(bearer(punching));
      assert.equal(removed.status, 200);
      assert.equal(removed.body.components.length, 1);
      assert.equal((await ctx.api.delete('/api/designs/30-01/components/BELT').set(bearer(punching))).status, 404);
    });

    it('searches ignoring case, spaces and dashes', async () => {
      const list = async (q: string) => (await ctx.api.get('/api/designs').query({ q }).set(bearer(punching))).body as { designNo: string }[];
      assert.deepEqual((await list('2649')).map((d) => d.designNo), ['26-49']);
      assert.deepEqual((await list('26 - 49')).map((d) => d.designNo), ['26-49']);
      assert.deepEqual((await list('30')).map((d) => d.designNo), ['30-01']);
      assert.equal((await list('')).length, 2);
      const item = (await list('26-49'))[0] as unknown as { components: { name: string; sizes: string[] }[] };
      assert.equal(item.components[0]?.name, 'KALI');
      assert.equal(item.components[0]?.sizes.length, 12);
    });

    it('renames and deletes a design that has no orders', async () => {
      const created = await ctx.api.post('/api/designs').set(bearer(punching)).send({ designNo: '50-01', productName: 'Frock' });
      assert.equal(created.status, 201);

      const taken = await ctx.api.patch('/api/designs/50-01').set(bearer(punching)).send({ designNo: '26-49' });
      assert.equal(taken.status, 409);
      const renamed = await ctx.api.patch('/api/designs/50-01').set(bearer(punching)).send({ designNo: '50-02', productName: 'gown' });
      assert.equal(renamed.status, 200);
      assert.equal(renamed.body.designNo, '50-02');
      assert.equal(renamed.body.productName, 'GOWN');
      assert.equal((await ctx.api.get('/api/designs/50-01').set(bearer(punching))).status, 404);
      const found = (await ctx.api.get('/api/designs').query({ q: '5002' }).set(bearer(punching))).body;
      assert.deepEqual(found.map((d: { designNo: string }) => d.designNo), ['50-02']);

      assert.equal((await ctx.api.patch('/api/designs/50-02').set(bearer(punching)).send({})).body.error, 'Nothing to change.');
      assert.equal((await ctx.api.delete('/api/designs/50-02').set(bearer(production))).status, 403);
      assert.equal((await ctx.api.delete('/api/designs/50-02').set(bearer(punching))).status, 204);
      assert.equal((await ctx.api.get('/api/designs/50-02').set(bearer(punching))).status, 404);
    });

    it('unknown design → 404', async () => {
      assert.equal((await ctx.api.get('/api/designs/99-99').set(bearer(punching))).status, 404);
    });
  });

  describe('validation messages', () => {
    const put = (sizes: unknown) => ctx.api.put('/api/designs/30-01/components/FROCK').set(bearer(punching)).send({ sizes });

    it('negative values', async () => {
      assert.equal((await put([{ size: '18', stitch: -1 }])).body.error, 'Stitch cannot be negative.');
      assert.equal((await put([{ size: '18', stitch: 1, laser: -2 }])).body.error, 'Laser cannot be negative.');
      const res = await put([{ size: '18', stitch: 1, consumption: { CORD: -5 } }]);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Consumption cannot be negative.');
    });

    it('duplicate size', async () => {
      const res = await put([{ size: '18', stitch: 1 }, { size: ' 18', stitch: 2 }]);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Size 18 is listed twice.');
    });

    it('stitch missing, no sizes, unknown material', async () => {
      assert.equal((await put([{ size: '18' }])).body.error, 'Stitch is required.');
      assert.equal((await put([{ size: '18', stitch: 1.5 }])).body.error, 'Stitch must be a whole number.');
      assert.equal((await put([])).body.error, 'Add at least one size.');
      const unknown = await put([{ size: '18', stitch: 1, consumption: { GOLD: 1 } }]);
      assert.equal(unknown.status, 400);
      assert.equal(unknown.body.error, 'Unknown material GOLD.');
    });

    it('nothing was saved by the failed attempts', async () => {
      const design = (await ctx.api.get('/api/designs/30-01').set(bearer(punching))).body;
      assert.equal(design.components.some((c: { name: string }) => c.name === 'FROCK'), false);
    });
  });

  describe('material master', () => {
    it('requires the rule fields of the category, > 0', async () => {
      const post = (body: object) => ctx.api.post('/api/materials').set(bearer(ctx.adminToken)).send(body);
      assert.equal((await post({ code: 'SEQ-5MM', name: '5-MM Sequence', category: 'SEQUENCE', rules: { seqPerCd: 100 } })).body.error,
        'CD per roll is required for Sequence materials.');
      assert.equal((await post({ code: 'B1', name: 'B', category: 'BEAD', rules: { pcsPerKg: 0 } })).body.error, 'Pieces per KG must be greater than 0.');
      assert.equal((await post({ code: 'C1', name: 'C', category: 'CORD' })).body.error, 'Denier is required for Cord materials.');
      assert.equal((await post({ code: 'Z1', category: 'NOPE', rules: {} })).body.error, 'Unknown category NOPE. Add it under Material Master → Categories first.');
      assert.equal((await post({ code: 'seq-3mm', name: 'Dup', category: 'BEAD', rules: { pcsPerKg: 1 } })).status, 409);
    });

    it('adds a material last, clears other-category fields, keeps the code fixed', async () => {
      const created = await ctx.api
        .post('/api/materials')
        .set(bearer(ctx.adminToken))
        .send({ code: 'moti-5mm', name: '5-MM Moti', category: 'bead', rules: { pcsPerKg: 30000, denier: 99 } });
      assert.equal(created.status, 201);
      assert.equal(created.body.code, 'MOTI-5MM');
      assert.equal(created.body.sortOrder, 11);
      assert.deepEqual(created.body.rules, { pcsPerKg: 30000 });
      assert.equal(created.body.categoryName, 'Beads & decorative');

      const updated = await ctx.api
        .put('/api/materials/MOTI-5MM')
        .set(bearer(ctx.adminToken))
        .send({ name: '5-MM Moti Gold', category: 'CORD', rules: { denier: 600, pcsPerKg: 30000 } });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.code, 'MOTI-5MM');
      assert.deepEqual(updated.body.rules, { denier: 600 });
      assert.equal(updated.body.unit, 'MTR');
    });

    it('the name is optional and falls back to the code', async () => {
      const created = await ctx.api.post('/api/materials').set(bearer(ctx.adminToken)).send({ code: 'seq-5mm', category: 'SEQUENCE', rules: { seqPerCd: 9000, cdPerRoll: 60 } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.name, 'SEQ-5MM');
      const named = await ctx.api.put('/api/materials/SEQ-5MM').set(bearer(ctx.adminToken)).send({ name: '5-MM', category: 'SEQUENCE', rules: { seqPerCd: 9000, cdPerRoll: 60 } });
      assert.equal(named.body.name, '5-MM');
      const cleared = await ctx.api.put('/api/materials/SEQ-5MM').set(bearer(ctx.adminToken)).send({ category: 'SEQUENCE', rules: { seqPerCd: 9000, cdPerRoll: 60 } });
      assert.equal(cleared.body.name, 'SEQ-5MM');
      assert.equal((await ctx.api.delete('/api/materials/SEQ-5MM').set(bearer(ctx.adminToken))).status, 204);
    });

    it('refuses to remove a material a design uses; removes an unused one', async () => {
      const used = await ctx.api.delete('/api/materials/SEQ-3MM').set(bearer(ctx.adminToken));
      assert.equal(used.status, 409);
      assert.equal(used.body.error, 'This material is used by a design and cannot be removed.');
      assert.equal((await ctx.api.delete('/api/materials/MOTI-5MM').set(bearer(ctx.adminToken))).status, 204);
      assert.equal((await ctx.api.delete('/api/materials/MOTI-5MM').set(bearer(ctx.adminToken))).status, 404);
    });
  });
});
