import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connect } from "./db/client.js";
import { loggerOptions } from "./logger.js";
import { FakePaymentGateway } from "./payments/fake-gateway.js";

const config = loadConfig();
const database = connect(config.DATABASE_URL);
const gateway = new FakePaymentGateway({ declinedEmails: config.FAKE_GATEWAY_DECLINED_EMAILS });
const app = buildApp({ db: database.db, gateway, logger: loggerOptions(config) });

app.addHook("onClose", async () => {
  await database.close();
});

let closing = false;
async function shutdown(signal: NodeJS.Signals) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err, "error during shutdown");
    process.exit(1);
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
