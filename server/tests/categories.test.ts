import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { migrateMaterialRules, migrateOrderUnits } from '../src/db/migrations.js';
import { MaterialCategoryModel } from '../src/modules/material-categories/material-category.model.js';
import { MaterialModel } from '../src/modules/materials/material.model.js';
import { bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';
import { createFixtureOrder, loadFixture, round2 } from './fixture.js';

describe('material categories (admin-configurable formulas)', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await startTestApp();
    await loadFixture(ctx.api, ctx.adminToken);
    await createFixtureOrder(ctx.api, ctx.adminToken);
  });
  after(async () => {
    await ctx.stop();
  });

  const zardoshi = {
    code: 'zardoshi',
    name: 'Zardoshi',
    unit: 'pcs',
    fields: [{ key: 'pcsPerKg', label: 'Pieces per KG', required: true }],
    steps: [{ key: 'kg', label: 'KG', formula: 'TOTAL ÷ pcsPerKg' }],
    purchaseStep: 'kg',
  };

  it('lists the three default categories with their formulas and material counts', async () => {
    const res = await ctx.api.get('/api/material-categories').set(bearer(ctx.adminToken));
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((c: { code: string; materialCount: number }) => [c.code, c.materialCount]),
      [['SEQUENCE', 4], ['BEAD', 6], ['CORD', 1]],
    );
    assert.deepEqual(res.body[0].steps, [
      { key: 'CD', label: 'CD', formula: 'TOTAL / seqPerCd' },
      { key: 'ROLLS', label: 'Rolls', formula: 'CD / cdPerRoll' },
    ]);
  });

  it('orders show sequences in whole CDs, other categories in their purchase step', async () => {
    const res = await ctx.api.get('/api/material-categories').set(bearer(ctx.adminToken));
    assert.deepEqual(
      res.body.map((c: { code: string; orderStep: string | null; wholeUnits: boolean }) => [c.code, c.orderStep, c.wholeUnits]),
      [['SEQUENCE', 'CD', true], ['BEAD', null, false], ['CORD', null, false]],
    );
  });

  it('existing databases get the order unit once (later Admin edits are kept)', async () => {
    await MaterialCategoryModel.collection.updateMany({}, { $unset: { orderStep: '', wholeUnits: '' } });
    assert.equal(await migrateOrderUnits(), 3);
    const sequence = await MaterialCategoryModel.findOne({ code: 'SEQUENCE' });
    assert.deepEqual([sequence!.orderStep, sequence!.wholeUnits], ['CD', true]);
    await MaterialCategoryModel.updateOne({ code: 'SEQUENCE' }, { $set: { orderStep: 'ROLLS' } });
    assert.equal(await migrateOrderUnits(), 0);
    assert.equal((await MaterialCategoryModel.findOne({ code: 'SEQUENCE' }))!.orderStep, 'ROLLS');
    await MaterialCategoryModel.updateOne({ code: 'SEQUENCE' }, { $set: { orderStep: 'CD' } });
  });

  it('the order unit must be one of the steps', async () => {
    const bad = await ctx.api
      .post('/api/material-categories')
      .set(bearer(ctx.adminToken))
      .send({ ...zardoshi, code: 'pipe', orderStep: 'cd' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'The unit shown on orders must be one of the formula steps.');
  });

  it('creates a new category; materials then use it in purchase', async () => {
    const created = await ctx.api.post('/api/material-categories').set(bearer(ctx.adminToken)).send(zardoshi);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.code, 'ZARDOSHI');
    assert.equal(created.body.unit, 'PCS');
    assert.equal(created.body.purchaseStep, 'KG');
    assert.equal(created.body.sortOrder, 3);

    // Move the fixture's zardoshi material into the new category (45,000 pcs/KG as before).
    const moved = await ctx.api
      .put('/api/materials/ZARDOSHI-7MM')
      .set(bearer(ctx.adminToken))
      .send({ category: 'ZARDOSHI', rules: { pcsPerKg: 45000 } });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.categoryName, 'Zardoshi');

    const purchase = await ctx.api.get('/api/purchase/requirements?orderNo=1').set(bearer(ctx.adminToken));
    const row = purchase.body.totals.find((t: { code: string }) => t.code === 'ZARDOSHI-7MM');
    assert.equal(row.category, 'ZARDOSHI');
    assert.equal(round2(row.purchase), 1.02);
    assert.ok(purchase.body.categories.some((c: { code: string }) => c.code === 'ZARDOSHI'));
  });

  it('editing a formula changes the purchase figures', async () => {
    const withWastage = {
      ...zardoshi,
      fields: [...zardoshi.fields, { key: 'wastage', label: 'Wastage %', required: false }],
      steps: [...zardoshi.steps, { key: 'total_kg', label: 'KG incl. wastage', formula: 'KG * (1 + wastage / 100)' }],
      purchaseStep: 'TOTAL_KG',
    };
    const { code: _code, ...body } = withWastage;
    assert.equal((await ctx.api.put('/api/material-categories/ZARDOSHI').set(bearer(ctx.adminToken)).send(body)).status, 200);
    await ctx.api.put('/api/materials/ZARDOSHI-7MM').set(bearer(ctx.adminToken)).send({ category: 'ZARDOSHI', rules: { pcsPerKg: 45000, wastage: 10 } });

    const purchase = await ctx.api.get('/api/purchase/requirements?orderNo=1').set(bearer(ctx.adminToken));
    const row = purchase.body.totals.find((t: { code: string }) => t.code === 'ZARDOSHI-7MM');
    assert.equal(round2(row.values.KG), 1.02);
    assert.equal(round2(row.purchase), 1.12);
  });

  it('refuses invalid formulas with a readable message', async () => {
    const post = (patch: object) => ctx.api.post('/api/material-categories').set(bearer(ctx.adminToken)).send({ ...zardoshi, code: 'BAD', ...patch });
    const unknown = await post({ steps: [{ key: 'KG', label: 'KG', formula: 'TOTAL / pcsPerKgg' }] });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, 'Step KG: unknown name “PCSPERKGG”. Use TOTAL, a field, or an earlier step.');
    const syntax = await post({ steps: [{ key: 'KG', label: 'KG', formula: 'TOTAL / (pcsPerKg' }] });
    assert.equal(syntax.body.error, 'Step KG: A bracket is not closed.');
    const purchaseStep = await post({ purchaseStep: 'NOPE' });
    assert.equal(purchaseStep.body.error, 'Choose which step is the purchase quantity.');
    assert.equal((await post({ code: 'zardoshi' })).status, 409);
  });

  it('a category in use cannot be removed; an unused one can', async () => {
    const used = await ctx.api.delete('/api/material-categories/SEQUENCE').set(bearer(ctx.adminToken));
    assert.equal(used.status, 409);
    assert.equal(used.body.error, 'This category is used by 4 materials and cannot be removed.');
    await ctx.api.post('/api/material-categories').set(bearer(ctx.adminToken)).send({ ...zardoshi, code: 'SPARE' });
    assert.equal((await ctx.api.delete('/api/material-categories/SPARE').set(bearer(ctx.adminToken))).status, 204);
  });

  it('only Material Master managers can change categories', async () => {
    const prod = await createActiveUser(ctx, { email: 'prod-cat@example.com', roleName: 'Production Employee' });
    assert.equal((await ctx.api.get('/api/material-categories').set(bearer(prod.token))).status, 403);
    assert.equal((await ctx.api.post('/api/material-categories').set(bearer(prod.token)).send({ ...zardoshi, code: 'X' })).status, 403);
  });

  it('old materials with fixed rule fields are moved to the new format', async () => {
    await MaterialModel.collection.insertOne({ code: 'OLD-SEQ', name: 'Old', category: 'SEQUENCE', sortOrder: 99, seqPerCd: 100, cdPerRoll: 5, cdPerRound: null, pcsPerKg: null, denier: null });
    assert.equal(await migrateMaterialRules(), 1);
    const migrated = await MaterialModel.collection.findOne({ code: 'OLD-SEQ' });
    assert.deepEqual(migrated?.rules, { seqPerCd: 100, cdPerRoll: 5 });
    assert.equal('seqPerCd' in (migrated ?? {}), false);
    assert.equal(await migrateMaterialRules(), 0);
  });
});
