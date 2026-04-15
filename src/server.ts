import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loggerOptions } from "./logger.js";

const config = loadConfig();
const app = buildApp({ logger: loggerOptions(config) });

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
