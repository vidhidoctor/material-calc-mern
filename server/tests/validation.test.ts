import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { EnvError, parseEnv } from '../src/config/env.js';
import { bearer, startTestApp, type TestContext } from './helpers.js';

describe('bad input returns 400, never crashes', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await startTestApp();
  });
  after(async () => {
    await ctx.stop();
  });

  it('invalid JSON → 400', async () => {
    const res = await ctx.api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid JSON body.');
  });

  it('missing body and missing fields → 400 with a readable message', async () => {
    const empty = await ctx.api.post('/api/auth/signup');
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, 'Name is required.');

    const badEmail = await ctx.api.post('/api/auth/signup').send({ name: 'A', email: 'not-an-email', password: 'Password#1' });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.body.error, 'Please enter a valid email.');

    const shortPassword = await ctx.api.post('/api/auth/signup').send({ name: 'A', email: 'a@example.com', password: 'short' });
    assert.equal(shortPassword.status, 400);
    assert.equal(shortPassword.body.error, 'Password must be at least 8 characters.');
  });

  it('wrong types → 400', async () => {
    const res = await ctx.api.post('/api/auth/login').send({ email: 42, password: ['x'] });
    assert.equal(res.status, 400);
    const perms = await ctx.api.post('/api/admin/roles').set(bearer(ctx.adminToken)).send({ name: 'R', permissions: ['NOT_A_PERMISSION'] });
    assert.equal(perms.status, 400);
    assert.equal(perms.body.error, 'Unknown permission.');
  });

  it('invalid ids → 400, unknown ids → 404', async () => {
    const bad = await ctx.api.patch('/api/admin/users/not-an-id').set(bearer(ctx.adminToken)).send({ name: 'X' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'Invalid id.');
    const unknown = await ctx.api.patch('/api/admin/users/0123456789abcdef01234567').set(bearer(ctx.adminToken)).send({ name: 'X' });
    assert.equal(unknown.status, 404);
  });

  it('unknown route → 404', async () => {
    assert.equal((await ctx.api.get('/api/nope')).status, 404);
  });

  it('server keeps serving after bad input', async () => {
    assert.equal((await ctx.api.get('/api/health')).status, 200);
  });
});

describe('environment validation', () => {
  it('lists every missing or invalid variable', () => {
    assert.throws(
      () => parseEnv({ PORT: 'abc', MONGODB_URI: undefined, NODE_ENV: 'staging' }),
      (error: unknown) => {
        assert.ok(error instanceof EnvError);
        assert.match(error.message, /MONGODB_URI: missing/);
        assert.match(error.message, /PORT:/);
        assert.match(error.message, /NODE_ENV:/);
        return true;
      },
    );
  });

  it('rejects a non-MongoDB URI and applies defaults', () => {
    assert.throws(() => parseEnv({ MONGODB_URI: 'postgres://x' }), /must start with mongodb/);
    const env = parseEnv({ MONGODB_URI: 'mongodb://localhost/x', ADMIN_EMAIL: '' });
    assert.equal(env.PORT, 4000);
    assert.equal(env.NODE_ENV, 'development');
    assert.equal(env.ADMIN_EMAIL, undefined);
  });
});
