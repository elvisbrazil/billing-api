import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { InvoiceService } from "./invoice.service.js";

const idParams = z.object({ id: z.uuid() });

export const invoiceRoutes: FastifyPluginAsyncZod<{ invoices: InvoiceService }> = async (
  app,
  { invoices },
) => {
  app.get("/:id", { schema: { tags: ["invoices"], params: idParams } }, async (request) =>
    invoices.get(request.params.id),
  );

  app.post("/:id/void", { schema: { tags: ["invoices"], params: idParams } }, async (request) =>
    invoices.void(request.params.id),
  );
};
