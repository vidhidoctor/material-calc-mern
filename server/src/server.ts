import { createApp } from './app.js';
import { EnvError, getEnv, loadDotEnv, type Env } from './config/env.js';
import { connectDb } from './db/connect.js';
import { backfillPartyOrderNos } from './modules/orders/order.model.js';

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
const numbered = await backfillPartyOrderNos();
if (numbered > 0) console.info(`Numbered ${numbered} existing order(s) per design + party.`);
createApp().listen(env.PORT, () => {
  console.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
