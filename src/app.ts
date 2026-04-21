import { sql } from "drizzle-orm";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Database } from "./db/client.js";
import { CustomerRepository } from "./modules/customers/customer.repository.js";
import { customerRoutes } from "./modules/customers/customer.routes.js";
import { CustomerService } from "./modules/customers/customer.service.js";
import { PlanRepository } from "./modules/plans/plan.repository.js";
import { planRoutes } from "./modules/plans/plan.routes.js";
import { PlanService } from "./modules/plans/plan.service.js";
import { registerProblemDetails } from "./plugins/problem-details.js";

export interface AppOptions {
  db: Database;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp(options: AppOptions) {
  const { db } = options;
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerProblemDetails(app);

  const plans = new PlanService(new PlanRepository(db));
  const customers = new CustomerService(new CustomerRepository(db));

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok" };
  });

  app.register(planRoutes, { prefix: "/plans", plans });
  app.register(customerRoutes, { prefix: "/customers", customers });

  return app;
}

export type App = ReturnType<typeof buildApp>;
