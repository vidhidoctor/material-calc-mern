import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bearer, createActiveUser, findId, startTestApp, type TestContext } from './helpers.js';

describe('admin: permissions, escalation and self-lockout', () => {
  let ctx: TestContext;
  let adminId: string;
  let adminRoleId: string;

  before(async () => {
    ctx = await startTestApp();
    const me = await ctx.api.get('/api/auth/me').set(bearer(ctx.adminToken));
    adminId = me.body.id;
    adminRoleId = me.body.role.id;
  });
  after(async () => {
    await ctx.stop();
  });

  it('answers 403 without the permission and 200 with it', async () => {
    const punching = await createActiveUser(ctx, { email: 'punch@example.com', roleName: 'Punching Employee', departmentName: 'Punching' });
    const forbidden = await ctx.api.get('/api/admin/users').set(bearer(punching.token));
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error, 'You do not have permission to do this.');
    assert.equal((await ctx.api.get('/api/admin/roles').set(bearer(punching.token))).status, 403);
    assert.equal((await ctx.api.get('/api/admin/users').set(bearer(ctx.adminToken))).status, 200);
    assert.equal((await ctx.api.get('/api/admin/permissions').set(bearer(ctx.adminToken))).status, 200);
  });

  it('creates roles and departments; duplicates (any case) are 409', async () => {
    const role = await ctx.api.post('/api/admin/roles').set(bearer(ctx.adminToken)).send({ name: 'Viewer', permissions: ['USER_VIEW'] });
    assert.equal(role.status, 201);
    assert.deepEqual(role.body.permissions, ['USER_VIEW']);
    assert.equal((await ctx.api.post('/api/admin/roles').set(bearer(ctx.adminToken)).send({ name: 'viewer' })).status, 409);

    const dept = await ctx.api.post('/api/admin/departments').set(bearer(ctx.adminToken)).send({ name: ' Stores ' });
    assert.equal(dept.status, 201);
    assert.equal(dept.body.name, 'Stores');
    assert.equal((await ctx.api.post('/api/admin/departments').set(bearer(ctx.adminToken)).send({ name: 'STORES' })).status, 409);
  });

  describe('no privilege escalation', () => {
    let manager: { id: string; token: string };

    before(async () => {
      const res = await ctx.api
        .post('/api/admin/roles')
        .set(bearer(ctx.adminToken))
        .send({ name: 'User Manager', permissions: ['USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'ROLE_MANAGE', 'PERMISSION_MANAGE'] });
      assert.equal(res.status, 201);
      manager = await createActiveUser(ctx, { email: 'manager@example.com', roleName: 'User Manager', departmentName: 'Administration' });
    });

    it('cannot create a user with a role holding permissions they lack', async () => {
      const [adminRole, viewerRole, deptId] = await Promise.all([
        findId(ctx.api, ctx.adminToken, 'roles', 'Admin'),
        findId(ctx.api, ctx.adminToken, 'roles', 'Viewer'),
        findId(ctx.api, ctx.adminToken, 'departments', 'Production'),
      ]);
      const escalate = await ctx.api
        .post('/api/admin/users')
        .set(bearer(manager.token))
        .send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'Password#1', roleId: adminRole, departmentId: deptId, isActive: true });
      assert.equal(escalate.status, 403);

      const allowed = await ctx.api
        .post('/api/admin/users')
        .set(bearer(manager.token))
        .send({ name: 'Viewer', email: 'viewer@example.com', password: 'Password#1', roleId: viewerRole, departmentId: deptId, isActive: true });
      assert.equal(allowed.status, 201);
    });

    it('cannot give themselves (or anyone) a stronger role', async () => {
      const adminRole = await findId(ctx.api, ctx.adminToken, 'roles', 'Admin');
      const self = await ctx.api.patch(`/api/admin/users/${manager.id}`).set(bearer(manager.token)).send({ roleId: adminRole });
      assert.equal(self.status, 400);
      const other = await createActiveUser(ctx, { email: 'other@example.com', roleName: 'Viewer' });
      const res = await ctx.api.patch(`/api/admin/users/${other.id}`).set(bearer(manager.token)).send({ roleId: adminRole });
      assert.equal(res.status, 403);
    });

    it('cannot change a user who holds permissions they lack (e.g. reset the Admin password)', async () => {
      const res = await ctx.api.patch(`/api/admin/users/${adminId}`).set(bearer(manager.token)).send({ password: 'Hijack#123' });
      assert.equal(res.status, 403);
    });

    it('cannot create a role or grant permissions they do not hold', async () => {
      const create = await ctx.api.post('/api/admin/roles').set(bearer(manager.token)).send({ name: 'Deleter', permissions: ['USER_DELETE'] });
      assert.equal(create.status, 403);

      const viewerId = await findId(ctx.api, ctx.adminToken, 'roles', 'Viewer');
      const grant = await ctx.api
        .put(`/api/admin/roles/${viewerId}/permissions`)
        .set(bearer(manager.token))
        .send({ permissions: ['USER_VIEW', 'MATERIAL_MASTER_MANAGE'] });
      assert.equal(grant.status, 403);

      const ok = await ctx.api.put(`/api/admin/roles/${viewerId}/permissions`).set(bearer(manager.token)).send({ permissions: ['USER_VIEW', 'USER_CREATE'] });
      assert.equal(ok.status, 200);
    });
  });

  describe('no self-lockout', () => {
    it('admin cannot deactivate themselves', async () => {
      const res = await ctx.api.patch(`/api/admin/users/${adminId}`).set(bearer(ctx.adminToken)).send({ isActive: false });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'You cannot deactivate your own account.');
    });

    it('admin cannot delete themselves', async () => {
      const res = await ctx.api.delete(`/api/admin/users/${adminId}`).set(bearer(ctx.adminToken));
      assert.equal(res.status, 400);
    });

    it('admin cannot change their own role', async () => {
      const roleId = await findId(ctx.api, ctx.adminToken, 'roles', 'Punching Employee');
      const res = await ctx.api.patch(`/api/admin/users/${adminId}`).set(bearer(ctx.adminToken)).send({ roleId });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'You cannot change your own role.');
    });

    it('admin cannot remove PERMISSION_MANAGE from their own role', async () => {
      const res = await ctx.api.put(`/api/admin/roles/${adminRoleId}/permissions`).set(bearer(ctx.adminToken)).send({ permissions: ['USER_VIEW'] });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'You cannot remove PERMISSION_MANAGE from your own role.');
    });

    it('admin can still edit their own name', async () => {
      const res = await ctx.api.patch(`/api/admin/users/${adminId}`).set(bearer(ctx.adminToken)).send({ name: 'Head Admin' });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'Head Admin');
    });
  });

  it('deletes another user and ends their session', async () => {
    const user = await createActiveUser(ctx, { email: 'delete-me@example.com', roleName: 'Production Employee' });
    assert.equal((await ctx.api.delete(`/api/admin/users/${user.id}`).set(bearer(ctx.adminToken))).status, 204);
    assert.equal((await ctx.api.get('/api/auth/me').set(bearer(user.token))).status, 401);
    assert.equal((await ctx.api.delete(`/api/admin/users/${user.id}`).set(bearer(ctx.adminToken))).status, 404);
  });
});
