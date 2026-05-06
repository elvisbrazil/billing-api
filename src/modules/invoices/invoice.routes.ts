import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { paymentFailed } from "../../errors.js";
import type { PaymentService } from "../payments/payment.service.js";
import type { InvoiceService } from "./invoice.service.js";

const idParams = z.object({ id: z.uuid() });

export const invoiceRoutes: FastifyPluginAsyncZod<{
  invoices: InvoiceService;
  payments: PaymentService;
}> = async (app, { invoices, payments }) => {
  app.get("/:id", { schema: { tags: ["invoices"], params: idParams } }, async (request) =>
    invoices.get(request.params.id),
  );

  app.post("/:id/void", { schema: { tags: ["invoices"], params: idParams } }, async (request) =>
    invoices.void(request.params.id),
  );

  app.post("/:id/pay", { schema: { tags: ["invoices"], params: idParams } }, async (request) => {
    const { invoice, result } = await payments.pay(request.params.id);
    if (result.status === "failed") {
      throw paymentFailed(`The payment for invoice ${invoice.number} was declined`, {
        reason: result.reason,
        invoiceId: invoice.id,
        attemptCount: invoice.attemptCount,
      });
    }
    return invoice;
  });
};
