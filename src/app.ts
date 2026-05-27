import { sql } from "drizzle-orm";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { systemClock, type Clock } from "./clock.js";
import type { Database } from "./db/client.js";
import { customerRoutes } from "./modules/customers/customer.routes.js";
import { invoiceRoutes } from "./modules/invoices/invoice.routes.js";
import { planRoutes } from "./modules/plans/plan.routes.js";
import { subscriptionRoutes } from "./modules/subscriptions/subscription.routes.js";
import type { PaymentGateway } from "./payments/gateway.js";
import { idempotencyHooks } from "./plugins/idempotency.js";
import { registerProblemDetails } from "./plugins/problem-details.js";
import { createServices } from "./services.js";

export interface AppOptions {
  db: Database;
  clock?: Clock;
  gateway: PaymentGateway;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp(options: AppOptions) {
  const { db } = options;
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerProblemDetails(app);

  const clock = options.clock ?? systemClock;
  const { plans, customers, invoices, payments, subscriptions } = createServices({
    db,
    clock,
    gateway: options.gateway,
  });
  const idempotency = idempotencyHooks(db, clock);

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok" };
  });

  app.register(planRoutes, { prefix: "/plans", plans });
  app.register(customerRoutes, { prefix: "/customers", customers });
  app.register(subscriptionRoutes, {
    prefix: "/subscriptions",
    subscriptions,
    invoices,
    idempotency,
  });
  app.register(invoiceRoutes, { prefix: "/invoices", invoices, payments, idempotency });

  return app;
}

export type App = ReturnType<typeof buildApp>;
