import { createApp } from './app.js';
import { EnvError, getEnv, loadDotEnv, type Env } from './config/env.js';
import { connectDb } from './db/connect.js';
import { seedFoundation } from './db/seed.js';
import { runStartupMigrations } from './db/migrations.js';
import { applyCordSheet, applyRateSheet } from './db/rate-sheet.js';

loadDotEnv();

let env: Env;
try {
  env = getEnv();
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

await connectDb(env.MONGODB_URI);
// Departments, roles and the first Admin (from ADMIN_EMAIL / ADMIN_PASSWORD) are created when missing,
// so a new database (e.g. a fresh UAT) works without running the seed by hand. Never overwrites passwords.
if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
  for (const line of await seedFoundation({ adminEmail: env.ADMIN_EMAIL, adminPassword: env.ADMIN_PASSWORD })) {
    if (line.includes('created') || line.includes('added')) console.info(line);
  }
}
for (const line of await runStartupMigrations()) console.info(line);
// The business rate sheet is loaded once; later edits in Material Master are kept.
for (const line of await applyRateSheet()) console.info(line);
for (const line of await applyCordSheet()) console.info(line);
createApp().listen(env.PORT, () => {
  console.info(`API listening on port ${env.PORT} (${env.APP_ENV}, ${env.NODE_ENV})`);
});
