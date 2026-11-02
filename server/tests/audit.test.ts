import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AuditLogModel } from '../src/modules/audit/audit-log.model.js';
import { ADMIN, bearer, createActiveUser, startTestApp, type TestContext } from './helpers.js';

type Change = { field: string; from: string | null; to: string | null };
type Event = {
  action: string;
  actionLabel: string;
  module: string;
  actor: { email: string; name: string; role: string | null } | null;
  entity: { type: string; id: string; label: string } | null;
  detail: string | null;
  changes: Change[];
  ip: string | null;
};

/** Every change is recorded on the server: who, when, what (before → after); entries can never be changed. */
describe('audit log', () => {
  let ctx: TestContext;
  let prod: string;
  let prodUserId: string;
  const admin = () => bearer(ctx.adminToken);
  const log = async (query: Record<string, string> = {}) => {
    const res = await ctx.api.get('/api/audit-logs').query(query).set(admin());
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body as { items: Event[]; total: number; page: number; pageSize: number };
  };
  const change = (event: Event, field: string) => event.changes.find((c) => c.field === field);

  before(async () => {
    ctx = await startTestApp();
    const user = await createActiveUser(ctx, { email: 'prod@example.com', roleName: 'Production Employee' });
    prod = user.token;
    prodUserId = user.id;
  });
  after(async () => {
    await ctx.stop();
  });

  it('records logins and failed logins with the email typed', async () => {
    assert.equal((await ctx.api.post('/api/auth/login').send({ email: ADMIN.email, password: 'wrong-password' })).status, 401);
    const failed = (await log({ action: 'LOGIN_FAILED' })).items[0]!;
    assert.deepEqual([failed.actor?.email, failed.module, failed.detail], [ADMIN.email, 'Auth', 'Invalid email or password.']);
    assert.ok((await log({ action: 'LOGIN' })).total >= 1);
  });

  it('records a create and an update with before → after, who and the record', async () => {
    const created = await ctx.api.post('/api/materials').set(admin()).send({ code: 'b-2mm', name: '2 MM Bead', category: 'BEAD', rules: { pcsPerKg: 1000 } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await ctx.api.put('/api/materials/B-2MM').set(admin()).send({ name: '2 MM Bead', category: 'BEAD', rules: { pcsPerKg: 2000 } });

    const [update, create] = (await log({ entityType: 'Material', entityId: 'B-2MM' })).items;
    assert.equal(update!.action, 'MATERIAL_UPDATED');
    assert.equal(update!.actionLabel, 'Material updated');
    assert.deepEqual(update!.entity, { type: 'Material', id: 'B-2MM', label: 'Material B-2MM' });
    assert.equal(update!.actor?.email, ADMIN.email);
    assert.deepEqual(change(update!, 'rules › pcsPerKg'), { field: 'rules › pcsPerKg', from: '1000', to: '2000' });
    assert.equal(update!.changes.length, 1);
    assert.ok(update!.ip);
    assert.equal(create!.action, 'MATERIAL_CREATED');
    assert.deepEqual(change(create!, 'code'), { field: 'code', from: null, to: 'B-2MM' });
  });

  it('records nothing for a refused request or an edit that changed nothing', async () => {
    const before = (await log()).total;
    assert.equal((await ctx.api.post('/api/materials').set(admin()).send({ code: 'B-2MM', category: 'BEAD', rules: { pcsPerKg: 1 } })).status, 409);
    await ctx.api.put('/api/materials/B-2MM').set(admin()).send({ name: '2 MM Bead', category: 'BEAD', rules: { pcsPerKg: 2000 } });
    assert.equal((await log()).total, before);
  });

  it('orders and designs: changes are shown per component and size', async () => {
    await ctx.api.put('/api/costing/rates/B-2MM').set(admin()).send({ basicRate: 500, gstPercent: 10 });
    await ctx.api.post('/api/designs').set(admin()).send({ designNo: 'A-1', productName: 'Lehenga' });
    await ctx.api.put('/api/designs/A-1/components/KALI').set(admin()).send({ sizes: [{ size: '18', stitch: 1, consumption: { 'B-2MM': 100 } }] });
    await ctx.api.put('/api/designs/A-1/components/KALI').set(admin()).send({ sizes: [{ size: '18', stitch: 1, consumption: { 'B-2MM': 120 } }] });
    const saved = (await log({ entityType: 'Design', entityId: 'A-1', action: 'COMPONENT_SAVED' })).items[0]!;
    assert.equal(saved.detail, 'KALI');
    assert.deepEqual(change(saved, 'components › KALI › sizes › 18 › consumption › B-2MM › qty'), {
      field: 'components › KALI › sizes › 18 › consumption › B-2MM › qty',
      from: '100',
      to: '120',
    });

    const order = await ctx.api.post('/api/orders').set(admin()).send({ designNo: 'A-1', party: 'AB', lines: [{ component: 'KALI', size: '18', quantity: 50 }] });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    await ctx.api.put(`/api/orders/${order.body.orderNo}`).set(admin()).send({ party: 'AB', lines: [{ component: 'KALI', size: '18', quantity: 60 }], types: {} });
    const updated = (await log({ entityType: 'Order', action: 'ORDER_UPDATED' })).items[0]!;
    assert.equal(updated.entity?.label, 'Order AB-1 · A-1');
    assert.deepEqual(change(updated, 'lines › KALI 18 › quantity'), { field: 'lines › KALI 18 › quantity', from: '50', to: '60' });
    assert.equal((await log({ entityType: 'Order', action: 'ORDER_CREATED' })).total, 1);
  });

  it('a record\'s History is open to whoever can see the record; costs are hidden without COST_VIEW', async () => {
    const res = await ctx.api.get('/api/audit-logs/entity/Order/1').set(bearer(prod));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const created = (res.body as Event[]).find((e) => e.action === 'ORDER_CREATED')!;
    const rate = created.changes.find((c) => c.field.startsWith('unitRates'))!;
    assert.equal(rate.to, '•••');
    assert.equal(created.changes.find((c) => c.field === 'party')!.to, 'AB');
    // Admin sees the rate.
    const adminView = (await ctx.api.get('/api/audit-logs/entity/Order/1').set(admin())).body as Event[];
    assert.equal(adminView.find((e) => e.action === 'ORDER_CREATED')!.changes.find((c) => c.field.startsWith('unitRates'))!.to, '550');
    // Production may not see users' or rates' history.
    assert.equal((await ctx.api.get(`/api/audit-logs/entity/User/${prodUserId}`).set(bearer(prod))).status, 403);
    assert.equal((await ctx.api.get('/api/audit-logs/entity/Rate/B-2MM').set(bearer(prod))).status, 403);
  });

  it('the Audit Log needs AUDIT_VIEW; a refused attempt is itself recorded', async () => {
    assert.equal((await ctx.api.get('/api/audit-logs').set(bearer(prod))).status, 403);
    const denied = (await log({ action: 'ACCESS_DENIED' })).items[0]!;
    assert.deepEqual([denied.actor?.email, denied.detail], ['prod@example.com', 'GET /api/audit-logs']);
  });

  it('passwords are never shown, only that they changed', async () => {
    await ctx.api.patch(`/api/admin/users/${prodUserId}`).set(admin()).send({ password: 'NewPass#123' });
    const event = (await log({ entityType: 'User', entityId: prodUserId })).items[0]!;
    assert.deepEqual(change(event, 'password'), { field: 'password', from: '•••', to: '••• (changed)' });
    assert.ok(!JSON.stringify(event).includes('NewPass#123'));
  });

  it('filters by user, module, text and dates; pages', async () => {
    const byUser = await log({ user: 'prod@' });
    assert.ok(byUser.items.length > 0 && byUser.items.every((e) => e.actor?.email === 'prod@example.com'));
    assert.ok((await log({ module: 'Punching' })).items.every((e) => e.module === 'Punching'));
    assert.ok((await log({ q: 'A-1' })).items.every((e) => `${e.entity?.label}${e.entity?.id}${e.detail}`.includes('A-1')));
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    assert.equal((await log({ from: tomorrow })).total, 0);
    const page = await log({ pageSize: '2', page: '2' });
    assert.equal(page.items.length, 2);
    assert.equal(page.page, 2);
    assert.equal((await ctx.api.get('/api/audit-logs').query({ action: 'NOPE' }).set(admin())).status, 400);
  });

  it('entries can never be changed or deleted', async () => {
    await assert.rejects(AuditLogModel.updateOne({}, { $set: { action: 'X' } }), /cannot be changed or deleted/);
    await assert.rejects(AuditLogModel.deleteMany({}), /cannot be changed or deleted/);
    const entry = await AuditLogModel.findOne();
    entry!.action = 'X';
    await assert.rejects(entry!.save(), /cannot be changed or deleted/);
  });
});
