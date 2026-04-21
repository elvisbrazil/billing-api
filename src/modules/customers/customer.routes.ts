import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { CustomerService } from "./customer.service.js";

const createCustomerBody = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),
});

export const customerRoutes: FastifyPluginAsyncZod<{ customers: CustomerService }> = async (
  app,
  { customers },
) => {
  app.post(
    "/",
    { schema: { tags: ["customers"], body: createCustomerBody } },
    async (request, reply) => {
      const customer = await customers.create(request.body);
      return reply.code(201).send(customer);
    },
  );

  app.get(
    "/:id",
    { schema: { tags: ["customers"], params: z.object({ id: z.uuid() }) } },
    async (request) => customers.get(request.params.id),
  );
};
