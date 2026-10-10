import { PERMISSION_CODES } from '@app/shared';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ADMIN, bearer, createActiveUser, login, startTestApp, type TestContext } from './helpers.js';

describe('global config: admin emails', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await startTestApp();
  });
  after(async () => {
    await ctx.stop();
  });

  const settings = async (token = ctx.adminToken) => ctx.api.get('/api/settings').set(bearer(token));
  const add = (body: object, token = ctx.adminToken) => ctx.api.post('/api/settings/admin-emails').set(bearer(token)).send(body);
  const remove = (email: string, token = ctx.adminToken) =>
    ctx.api.delete(`/api/settings/admin-emails/${encodeURIComponent(email)}`).set(bearer(token));

  it('the seeded admin is the primary admin email', async () => {
    const res = await settings();
    assert.equal(res.status, 200);
    assert.equal(res.body.adminEmails.length, 1);
    assert.equal(res.body.adminEmails[0].email, ADMIN.email);
    assert.equal(res.body.adminEmails[0].primary, true);
    assert.deepEqual({ ...res.body.adminEmails[0].account, id: 'x' }, { id: 'x', isActive: true, isAdmin: true });
  });

  it('adding an email creates an active Admin with the temporary password', async () => {
    const res = await add({ email: 'Second.Admin@Example.com', name: 'Second Admin', password: 'Temp#Pass1' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const entry = res.body.adminEmails.find((e: { email: string }) => e.email === 'second.admin@example.com');
    assert.equal(entry.addedBy, ADMIN.email);
    assert.equal(entry.account.isAdmin, true);

    const token = await login(ctx.api, 'second.admin@example.com', 'Temp#Pass1');
    const me = await ctx.api.get('/api/auth/me').set(bearer(token));
    assert.deepEqual(me.body.permissions, PERMISSION_CODES);
    assert.equal(me.body.department.name, 'Administration');
  });

  it('a temporary password is required when there is no account; duplicates are 409', async () => {
    const noPassword = await add({ email: 'nobody@example.com', name: 'Nobody' });
    assert.equal(noPassword.status, 400);
    assert.equal(noPassword.body.error, 'Enter a temporary password: there is no account for this email yet.');
    assert.equal((await add({ email: 'second.admin@example.com', name: 'Again', password: 'Temp#Pass1' })).status, 409);
  });

  it('an existing account is promoted to Admin (password kept when none is given)', async () => {
    const user = await createActiveUser(ctx, { email: 'worker@example.com', roleName: 'Production Employee' });
    const res = await add({ email: 'worker@example.com', name: 'Worker' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const me = await ctx.api.get('/api/auth/me').set(bearer(user.token));
    assert.equal(me.body.role.name, 'Admin');
    await login(ctx.api, 'worker@example.com', user.password);
  });

  it('removing an email takes away Admin, deactivates and logs the account out', async () => {
    const token = await login(ctx.api, 'second.admin@example.com', 'Temp#Pass1');
    const res = await remove('second.admin@example.com');
    assert.equal(res.status, 200);
    assert.equal(res.body.adminEmails.some((e: { email: string }) => e.email === 'second.admin@example.com'), false);
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer(token))).status, 401);
    const relogin = await ctx.api.post('/api/auth/login').send({ email: 'second.admin@example.com', password: 'Temp#Pass1' });
    assert.equal(relogin.status, 403);
    assert.equal((await remove('second.admin@example.com')).status, 404);
  });

  it('the primary admin and yourself cannot be removed', async () => {
    const workerToken = await login(ctx.api, 'worker@example.com', 'Password#1');
    const primary = await remove(ADMIN.email, workerToken);
    assert.equal(primary.status, 400);
    assert.equal(primary.body.error, 'The primary Admin (from server/.env) cannot be removed here.');
    const self = await remove('worker@example.com', workerToken);
    assert.equal(self.status, 400);
    assert.equal(self.body.error, 'You cannot remove yourself from the admin list.');
  });

  it('needs SETTINGS_MANAGE, and every Admin permission to add an admin', async () => {
    const production = await createActiveUser(ctx, { email: 'prod@example.com', roleName: 'Production Employee' });
    assert.equal((await settings(production.token)).status, 403);

    const role = await ctx.api.post('/api/admin/roles').set(bearer(ctx.adminToken)).send({ name: 'Config Only', permissions: ['SETTINGS_MANAGE'] });
    assert.equal(role.status, 201);
    const configOnly = await createActiveUser(ctx, { email: 'config@example.com', roleName: 'Config Only', departmentName: 'Administration' });
    assert.equal((await settings(configOnly.token)).status, 200);
    const escalate = await add({ email: 'config@example.com', name: 'Me', password: 'Temp#Pass1' }, configOnly.token);
    assert.equal(escalate.status, 403);
    assert.equal(escalate.body.error, 'Only someone with every Admin permission can add admins.');
  });
});
