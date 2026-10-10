// Optional: adds the 11 standard materials from MATRIAL.xlsx (docs/fixture-26-49.json) with their
// conversion rules. Only materials — no designs or orders. Existing codes are left unchanged.
import { readFileSync } from 'node:fs';
import { EnvError, getEnv, loadDotEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { seedMaterials, type StandardMaterial } from '../src/db/seed.js';

loadDotEnv();

try {
  const env = getEnv();
  const fixture = JSON.parse(readFileSync(new URL('../../docs/fixture-26-49.json', import.meta.url), 'utf8')) as {
    materials: (StandardMaterial & { sortOrder: number })[];
  };
  const materials = [...fixture.materials].sort((a, b) => a.sortOrder - b.sortOrder);
  await connectDb(env.MONGODB_URI);
  for (const line of await seedMaterials(materials)) console.info(line);
  console.info('Standard materials done.');
} catch (error) {
  console.error(error instanceof EnvError ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
