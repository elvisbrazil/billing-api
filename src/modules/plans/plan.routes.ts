import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { PlanService } from "./plan.service.js";

const createPlanBody = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  interval: z.enum(["month", "year"]),
  priceCents: z.number().int().nonnegative(),
  currency: z.literal("BRL").default("BRL"),
  trialDays: z.number().int().min(0).max(365).default(0),
});

export const planRoutes: FastifyPluginAsyncZod<{ plans: PlanService }> = async (app, { plans }) => {
  app.post("/", { schema: { tags: ["plans"], body: createPlanBody } }, async (request, reply) => {
    const plan = await plans.create(request.body);
    return reply.code(201).send(plan);
  });

  app.get("/", { schema: { tags: ["plans"] } }, async () => plans.list());

  app.get(
    "/:id",
    { schema: { tags: ["plans"], params: z.object({ id: z.uuid() }) } },
    async (request) => plans.get(request.params.id),
  );
};
