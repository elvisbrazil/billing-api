import { sql } from "drizzle-orm";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Database } from "./db/client.js";

export interface AppOptions {
  db: Database;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp(options: AppOptions) {
  const { db } = options;
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok" };
  });

  return app;
}

export type App = ReturnType<typeof buildApp>;
