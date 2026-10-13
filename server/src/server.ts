import { createApp } from './app.js';
import { EnvError, getEnv, loadDotEnv, type Env } from './config/env.js';
import { connectDb } from './db/connect.js';
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
for (const line of await runStartupMigrations()) console.info(line);
// The business rate sheet is loaded once; later edits in Material Master are kept.
for (const line of await applyRateSheet()) console.info(line);
for (const line of await applyCordSheet()) console.info(line);
createApp().listen(env.PORT, () => {
  console.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
