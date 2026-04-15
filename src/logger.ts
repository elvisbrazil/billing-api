import type { FastifyServerOptions } from "fastify";
import type { Config } from "./config.js";

export function loggerOptions(config: Config): FastifyServerOptions["logger"] {
  if (config.NODE_ENV === "development") {
    return { level: config.LOG_LEVEL, transport: { target: "pino-pretty" } };
  }
  return { level: config.LOG_LEVEL };
}
