import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { runStartupMigrations } from '../src/db/migrations.js';
import { seedFoundation } from '../src/db/seed.js';

export const ADMIN = { email: 'admin@example.com', password: 'Admin#12345' };

export type Api = ReturnType<typeof request>;

export interface TestContext {
  api: Api;
  adminToken: string;
  stop: () => Promise<void>;
}

/** In-memory MongoDB + seeded foundation + app. Tests never touch Atlas. */
export async function startTestApp(): Promise<TestContext> {
  const mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongo.getUri('material-calc-test');
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  await connectDb(process.env.MONGODB_URI);
  await seedFoundation({ adminEmail: ADMIN.email, adminPassword: ADMIN.password });
  await runStartupMigrations();
  const api = request(createApp());
  const adminToken = await login(api, ADMIN.email, ADMIN.password);

  return {
    api,
    adminToken,
    stop: async () => {
      await disconnectDb();
      await mongo.stop();
    },
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function login(api: Api, email: string, password: string): Promise<string> {
  const res = await api.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `login ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export async function findId(api: Api, adminToken: string, kind: 'roles' | 'departments', name: string): Promise<string> {
  const res = await api.get(`/api/admin/${kind}`).set(bearer(adminToken));
  assert.equal(res.status, 200);
  const item = (res.body as { id: string; name: string }[]).find((x) => x.name === name);
  assert.ok(item, `${kind} ${name} not found`);
  return item.id;
}

/** Creates an active user with the given role (by name) and returns its id and a login token. */
export async function createActiveUser(
  ctx: TestContext,
  { email, roleName, password = 'Password#1', departmentName = 'Production' }: {
    email: string;
    roleName: string;
    password?: string;
    departmentName?: string;
  },
): Promise<{ id: string; token: string; password: string }> {
  const [roleId, departmentId] = await Promise.all([
    findId(ctx.api, ctx.adminToken, 'roles', roleName),
    findId(ctx.api, ctx.adminToken, 'departments', departmentName),
  ]);
  const res = await ctx.api
    .post('/api/admin/users')
    .set(bearer(ctx.adminToken))
    .send({ name: email.split('@')[0], email, password, roleId, departmentId, isActive: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { id: res.body.id as string, token: await login(ctx.api, email, password), password };
}
