import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { IdempotencyHooks } from "../../plugins/idempotency.js";
import type { InvoiceService } from "../invoices/invoice.service.js";
import type { SubscriptionService } from "./subscription.service.js";

const idParams = z.object({ id: z.uuid() });

export const subscriptionRoutes: FastifyPluginAsyncZod<{
  subscriptions: SubscriptionService;
  invoices: InvoiceService;
  idempotency: IdempotencyHooks;
}> = async (app, { subscriptions, invoices, idempotency }) => {
  app.post(
    "/",
    {
      ...idempotency,
      schema: {
        tags: ["subscriptions"],
        body: z.object({ customerId: z.uuid(), planId: z.uuid() }),
      },
    },
    async (request, reply) => {
      const subscription = await subscriptions.create(request.body);
      return reply.code(201).send(subscription);
    },
  );

  app.get("/:id", { schema: { tags: ["subscriptions"], params: idParams } }, async (request) =>
    subscriptions.get(request.params.id),
  );

  app.post(
    "/:id/cancel",
    {
      schema: {
        tags: ["subscriptions"],
        params: idParams,
        body: z.object({ atPeriodEnd: z.boolean().default(true) }).nullish(),
      },
    },
    async (request) =>
      subscriptions.cancel(request.params.id, { atPeriodEnd: request.body?.atPeriodEnd ?? true }),
  );

  app.get(
    "/:id/invoices",
    { schema: { tags: ["subscriptions"], params: idParams } },
    async (request) => {
      await subscriptions.get(request.params.id);
      return invoices.listForSubscription(request.params.id);
    },
  );
};
