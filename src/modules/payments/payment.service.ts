import { and, asc, eq } from "drizzle-orm";
import { nextRetryAt } from "../../billing/dunning.js";
import type { Clock } from "../../clock.js";
import type { Database } from "../../db/client.js";
import { paymentAttempts } from "../../db/schema.js";
import { conflict, notFound } from "../../errors.js";
import type { ChargeResult, PaymentGateway } from "../../payments/gateway.js";
import { CustomerRepository } from "../customers/customer.repository.js";
import { InvoiceRepository, type Invoice } from "../invoices/invoice.repository.js";
import { assertTransition } from "../subscriptions/lifecycle.js";
import { SubscriptionRepository } from "../subscriptions/subscription.repository.js";

export interface PaymentOutcome {
  invoice: Invoice;
  result: ChargeResult;
}

export class PaymentService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly gateway: PaymentGateway,
  ) {}

  async pay(invoiceId: string): Promise<PaymentOutcome> {
    return this.db.transaction(async (tx) => {
      const invoices = new InvoiceRepository(tx);
      const subscriptions = new SubscriptionRepository(tx);

      const invoice = await invoices.findById(invoiceId, { lock: true });
      if (!invoice) throw notFound(`Invoice ${invoiceId} not found`);
      if (invoice.status !== "open") {
        throw conflict(`Invoice ${invoice.id} is ${invoice.status} and cannot be paid`);
      }
      const subscription = (await subscriptions.findById(invoice.subscriptionId, { lock: true }))!;
      const customer = await new CustomerRepository(tx).findById(invoice.customerId);
      const attemptNumber = invoice.attemptCount + 1;

      const result: ChargeResult =
        invoice.totalCents === 0
          ? { status: "succeeded", reference: "zero_amount" }
          : await this.gateway.charge({
              invoiceId: invoice.id,
              customer: { id: customer!.id, email: customer!.email },
              amountCents: invoice.totalCents,
              currency: invoice.currency,
              idempotencyKey: `${invoice.id}:${attemptNumber}`,
            });

      const now = this.clock.now();
      await tx.insert(paymentAttempts).values({
        invoiceId: invoice.id,
        status: result.status,
        amountCents: invoice.totalCents,
        gatewayReference: result.status === "succeeded" ? result.reference : null,
        failureReason: result.status === "failed" ? result.reason : null,
        attemptedAt: now,
      });

      if (result.status === "succeeded") {
        const paid = await invoices.update(invoice.id, {
          status: "paid",
          attemptCount: attemptNumber,
          paidAt: now,
          nextPaymentAttemptAt: null,
          updatedAt: now,
        });
        if (subscription.status === "trialing" || subscription.status === "past_due") {
          assertTransition(subscription.status, "active");
          await subscriptions.update(subscription.id, { status: "active", updatedAt: now });
        }
        return { invoice: paid, result };
      }

      const [firstFailure] = await tx
        .select({ attemptedAt: paymentAttempts.attemptedAt })
        .from(paymentAttempts)
        .where(and(eq(paymentAttempts.invoiceId, invoice.id), eq(paymentAttempts.status, "failed")))
        .orderBy(asc(paymentAttempts.attemptedAt))
        .limit(1);
      const retryAt = nextRetryAt(firstFailure!.attemptedAt, attemptNumber);

      if (retryAt) {
        const failed = await invoices.update(invoice.id, {
          attemptCount: attemptNumber,
          nextPaymentAttemptAt: retryAt,
          updatedAt: now,
        });
        if (subscription.status === "active" || subscription.status === "trialing") {
          await subscriptions.update(subscription.id, { status: "past_due", updatedAt: now });
        }
        return { invoice: failed, result };
      }

      const uncollectible = await invoices.update(invoice.id, {
        status: "uncollectible",
        attemptCount: attemptNumber,
        nextPaymentAttemptAt: null,
        updatedAt: now,
      });
      if (subscription.status !== "canceled") {
        await subscriptions.update(subscription.id, {
          status: "canceled",
          canceledAt: now,
          cancelAtPeriodEnd: false,
          updatedAt: now,
        });
      }
      return { invoice: uncollectible, result };
    });
  }
}
