import { EnvError, getEnv, loadDotEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { seedFoundation } from '../src/db/seed.js';

loadDotEnv();

try {
  const env = getEnv();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env before seeding.');
    process.exit(1);
  }
  await connectDb(env.MONGODB_URI);
  const log = await seedFoundation({ adminEmail: env.ADMIN_EMAIL, adminPassword: env.ADMIN_PASSWORD });
  for (const line of log) console.info(line);
  console.info('Seed complete.');
} catch (error) {
  console.error(error instanceof EnvError ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
