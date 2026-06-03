import { pino } from "pino";
import { systemClock } from "../clock.js";
import { loadConfig } from "../config.js";
import { connect } from "../db/client.js";
import { FakePaymentGateway } from "../payments/fake-gateway.js";
import { createServices } from "../services.js";
import { runBillingCycle } from "./billing-cycle.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const database = connect(config.DATABASE_URL);

try {
  const gateway = new FakePaymentGateway({ declinedEmails: config.FAKE_GATEWAY_DECLINED_EMAILS });
  await runBillingCycle(createServices({ db: database.db, clock: systemClock, gateway }), logger);
} catch (err) {
  logger.error(err, "billing cycle failed");
  process.exitCode = 1;
} finally {
  await database.close();
}
