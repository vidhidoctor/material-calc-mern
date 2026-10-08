import { PERMISSION_CODES } from '@app/shared';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PasswordResetModel } from '../src/modules/auth/password-reset.model.js';
import { ADMIN, bearer, createActiveUser, findId, login, startTestApp, type TestContext } from './helpers.js';

describe('auth', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await startTestApp();
  });
  after(async () => {
    await ctx.stop();
  });

  it('rejects unauthenticated and unknown-token requests with 401', async () => {
    assert.equal((await ctx.api.get('/api/auth/me')).status, 401);
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer('not-a-real-token'))).status, 401);
    assert.equal((await ctx.api.get('/api/admin/users')).status, 401);
  });

  it('returns the admin with every permission from /me', async () => {
    const res = await ctx.api.get('/api/auth/me').set(bearer(ctx.adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.email, ADMIN.email);
    assert.equal(res.body.role.name, 'Admin');
    assert.deepEqual(res.body.permissions, PERMISSION_CODES);
  });

  it('blocks sign-up logins until Admin assigns department + role and activates', async () => {
    const signup = await ctx.api
      .post('/api/auth/signup')
      .send({ name: '  New Person ', email: 'New.Person@Example.com', password: 'Password#1' });
    assert.equal(signup.status, 201);

    const blocked = await ctx.api.post('/api/auth/login').send({ email: 'new.person@example.com', password: 'Password#1' });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, 'Account is waiting for Admin activation.');

    const users = await ctx.api.get('/api/admin/users').set(bearer(ctx.adminToken));
    const pending = users.body[0];
    assert.equal(pending.email, 'new.person@example.com');
    assert.equal(pending.name, 'New Person');
    assert.equal(pending.pending, true);

    // Activating without a role is refused.
    const noRole = await ctx.api.patch(`/api/admin/users/${pending.id}`).set(bearer(ctx.adminToken)).send({ isActive: true });
    assert.equal(noRole.status, 400);

    const roleId = await findId(ctx.api, ctx.adminToken, 'roles', 'Punching Employee');
    const departmentId = await findId(ctx.api, ctx.adminToken, 'departments', 'Punching');
    const activated = await ctx.api
      .patch(`/api/admin/users/${pending.id}`)
      .set(bearer(ctx.adminToken))
      .send({ roleId, departmentId, isActive: true });
    assert.equal(activated.status, 200);
    assert.equal(activated.body.isActive, true);

    const token = await login(ctx.api, 'NEW.PERSON@example.com', 'Password#1');
    const me = await ctx.api.get('/api/auth/me').set(bearer(token));
    assert.deepEqual(me.body.permissions, ['PUNCHING_VIEW', 'PUNCHING_CREATE', 'PUNCHING_UPDATE']);
    assert.equal(me.body.department.name, 'Punching');
  });

  it('refuses a duplicate sign-up email (case-insensitive) with 409', async () => {
    const res = await ctx.api.post('/api/auth/signup').send({ name: 'X', email: ADMIN.email.toUpperCase(), password: 'Password#1' });
    assert.equal(res.status, 409);
  });

  it('answers 401 with the same message for a wrong password and an unknown email', async () => {
    const wrong = await ctx.api.post('/api/auth/login').send({ email: ADMIN.email, password: 'wrong-password' });
    const unknown = await ctx.api.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);
  });

  it('logout ends the session', async () => {
    const token = await login(ctx.api, ADMIN.email, ADMIN.password);
    assert.equal((await ctx.api.post('/api/auth/logout').set(bearer(token))).status, 204);
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer(token))).status, 401);
    // Other sessions of the same user are unaffected.
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer(ctx.adminToken))).status, 200);
  });

  it('deactivating a user ends their sessions immediately', async () => {
    const user = await createActiveUser(ctx, { email: 'deactivate@example.com', roleName: 'Production Employee' });
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer(user.token))).status, 200);

    const res = await ctx.api.patch(`/api/admin/users/${user.id}`).set(bearer(ctx.adminToken)).send({ isActive: false });
    assert.equal(res.status, 200);
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer(user.token))).status, 401);

    const relogin = await ctx.api.post('/api/auth/login').send({ email: 'deactivate@example.com', password: user.password });
    assert.equal(relogin.status, 403);
  });

  it('changing a password ends the user\'s sessions', async () => {
    const user = await createActiveUser(ctx, { email: 'newpass@example.com', roleName: 'Production Employee' });
    const res = await ctx.api.patch(`/api/admin/users/${user.id}`).set(bearer(ctx.adminToken)).send({ password: 'Another#Pass1' });
    assert.equal(res.status, 200);
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer(user.token))).status, 401);
    await login(ctx.api, 'newpass@example.com', 'Another#Pass1');
  });

  it('role permission changes apply on the next request', async () => {
    const user = await createActiveUser(ctx, { email: 'fresh@example.com', roleName: 'Production Employee' });
    const roleId = await findId(ctx.api, ctx.adminToken, 'roles', 'Production Employee');
    const before = await ctx.api.get('/api/admin/users').set(bearer(user.token));
    assert.equal(before.status, 403);

    const grant = await ctx.api
      .put(`/api/admin/roles/${roleId}/permissions`)
      .set(bearer(ctx.adminToken))
      .send({ permissions: ['PRODUCTION_VIEW', 'PRODUCTION_CREATE', 'PRODUCTION_UPDATE', 'PURCHASE_REQUIREMENT_VIEW', 'USER_VIEW'] });
    assert.equal(grant.status, 200);
    assert.equal((await ctx.api.get('/api/admin/users').set(bearer(user.token))).status, 200);

    const revoke = await ctx.api
      .put(`/api/admin/roles/${roleId}/permissions`)
      .set(bearer(ctx.adminToken))
      .send({ permissions: ['PRODUCTION_VIEW', 'PRODUCTION_CREATE', 'PRODUCTION_UPDATE', 'PURCHASE_REQUIREMENT_VIEW'] });
    assert.equal(revoke.status, 200);
    assert.equal((await ctx.api.get('/api/admin/users').set(bearer(user.token))).status, 403);
  });

  describe('forgot / reset password', () => {
    it('gives the same answer for unknown emails, without a token', async () => {
      const known = await ctx.api.post('/api/auth/forgot-password').send({ email: ADMIN.email });
      const unknown = await ctx.api.post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
      assert.equal(known.status, 200);
      assert.equal(unknown.status, 200);
      assert.equal(known.body.message, unknown.body.message);
      assert.equal(typeof known.body.devResetToken, 'string');
      assert.equal(unknown.body.devResetToken, undefined);
    });

    it('resets the password once, ends all sessions, and rejects reuse', async () => {
      const user = await createActiveUser(ctx, { email: 'forgot@example.com', roleName: 'Production Employee' });
      const forgot = await ctx.api.post('/api/auth/forgot-password').send({ email: 'Forgot@Example.com' });
      const token = forgot.body.devResetToken as string;

      const reset = await ctx.api.post('/api/auth/reset-password').send({ token, password: 'Brand#New1' });
      assert.equal(reset.status, 200);
      assert.equal((await ctx.api.get('/api/auth/me').set(bearer(user.token))).status, 401);

      const oldLogin = await ctx.api.post('/api/auth/login').send({ email: 'forgot@example.com', password: user.password });
      assert.equal(oldLogin.status, 401);
      await login(ctx.api, 'forgot@example.com', 'Brand#New1');

      const reuse = await ctx.api.post('/api/auth/reset-password').send({ token, password: 'Third#Pass1' });
      assert.equal(reuse.status, 400);
    });

    it('rejects an expired reset token', async () => {
      const forgot = await ctx.api.post('/api/auth/forgot-password').send({ email: ADMIN.email });
      await PasswordResetModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await ctx.api.post('/api/auth/reset-password').send({ token: forgot.body.devResetToken, password: 'Expired#1' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'This reset link is invalid or has expired.');
    });
  });
});
