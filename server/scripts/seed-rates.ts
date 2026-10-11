// Applies the business rate sheet (db/rate-sheet.ts). Runs once by default; add --force to re-apply
// (overwrites the sheet materials, their rates and the sequence type rates with the sheet values).
import { EnvError, getEnv, loadDotEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { runStartupMigrations } from '../src/db/migrations.js';
import { applyRateSheet } from '../src/db/rate-sheet.js';

loadDotEnv();

try {
  const env = getEnv();
  await connectDb(env.MONGODB_URI);
  for (const line of await runStartupMigrations()) console.info(line);
  const log = await applyRateSheet({ force: process.argv.includes('--force') });
  for (const line of log) console.info(line);
  console.info(log.length > 0 ? 'Rate sheet applied.' : 'Rate sheet was already applied (use --force to re-apply).');
} catch (error) {
  console.error(error instanceof EnvError ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
