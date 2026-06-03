import { buildApp } from "./app.js";
import { systemClock } from "./clock.js";
import { loadConfig } from "./config.js";
import { connect } from "./db/client.js";
import { runBillingCycle } from "./jobs/billing-cycle.js";
import { startScheduler } from "./jobs/scheduler.js";
import { loggerOptions } from "./logger.js";
import { FakePaymentGateway } from "./payments/fake-gateway.js";
import { createServices } from "./services.js";

const config = loadConfig();
const database = connect(config.DATABASE_URL);
const gateway = new FakePaymentGateway({ declinedEmails: config.FAKE_GATEWAY_DECLINED_EMAILS });
const app = buildApp({ db: database.db, gateway, logger: loggerOptions(config) });

const services = createServices({ db: database.db, clock: systemClock, gateway });
const scheduler =
  config.BILLING_JOB_INTERVAL_MS > 0
    ? startScheduler({
        intervalMs: config.BILLING_JOB_INTERVAL_MS,
        logger: app.log,
        task: () => runBillingCycle(services, app.log),
      })
    : undefined;

app.addHook("onClose", async () => {
  await scheduler?.stop();
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
