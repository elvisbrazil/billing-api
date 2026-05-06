import { sql } from "drizzle-orm";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { systemClock, type Clock } from "./clock.js";
import type { Database } from "./db/client.js";
import { CustomerRepository } from "./modules/customers/customer.repository.js";
import { customerRoutes } from "./modules/customers/customer.routes.js";
import { CustomerService } from "./modules/customers/customer.service.js";
import { invoiceRoutes } from "./modules/invoices/invoice.routes.js";
import { InvoiceService } from "./modules/invoices/invoice.service.js";
import { PaymentService } from "./modules/payments/payment.service.js";
import { PlanRepository } from "./modules/plans/plan.repository.js";
import { planRoutes } from "./modules/plans/plan.routes.js";
import { PlanService } from "./modules/plans/plan.service.js";
import { subscriptionRoutes } from "./modules/subscriptions/subscription.routes.js";
import { SubscriptionService } from "./modules/subscriptions/subscription.service.js";
import type { PaymentGateway } from "./payments/gateway.js";
import { registerProblemDetails } from "./plugins/problem-details.js";

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
  const plans = new PlanService(new PlanRepository(db));
  const customers = new CustomerService(new CustomerRepository(db));
  const invoices = new InvoiceService(db, clock);
  const payments = new PaymentService(db, clock, options.gateway);
  const subscriptions = new SubscriptionService(db, clock, invoices, payments);

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok" };
  });

  app.register(planRoutes, { prefix: "/plans", plans });
  app.register(customerRoutes, { prefix: "/customers", customers });
  app.register(subscriptionRoutes, { prefix: "/subscriptions", subscriptions, invoices });
  app.register(invoiceRoutes, { prefix: "/invoices", invoices, payments });

  return app;
}

export type App = ReturnType<typeof buildApp>;
