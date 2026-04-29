import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { SubscriptionService } from "./subscription.service.js";

const idParams = z.object({ id: z.uuid() });

export const subscriptionRoutes: FastifyPluginAsyncZod<{
  subscriptions: SubscriptionService;
}> = async (app, { subscriptions }) => {
  app.post(
    "/",
    {
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
};
