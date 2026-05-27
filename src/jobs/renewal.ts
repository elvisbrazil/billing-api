import { and, asc, inArray, lte } from "drizzle-orm";
import { billingPeriod } from "../billing/period.js";
import type { Clock } from "../clock.js";
import type { Database } from "../db/client.js";
import { subscriptions } from "../db/schema.js";
import type { InvoiceService } from "../modules/invoices/invoice.service.js";
import type { PaymentService } from "../modules/payments/payment.service.js";
import { PlanRepository } from "../modules/plans/plan.repository.js";
import { SubscriptionRepository } from "../modules/subscriptions/subscription.repository.js";

export interface RenewalSummary {
  renewed: number;
  canceled: number;
  paid: number;
  failed: number;
}

type Outcome = { kind: "skipped" } | { kind: "canceled" } | { kind: "renewed"; invoiceId?: string };

const BATCH_SIZE = 100;

export class RenewalJob {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
  ) {}

  async run(): Promise<RenewalSummary> {
    const summary: RenewalSummary = { renewed: 0, canceled: 0, paid: 0, failed: 0 };
    const now = this.clock.now();

    for (;;) {
      const due = await this.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            inArray(subscriptions.status, ["trialing", "active"]),
            lte(subscriptions.currentPeriodEnd, now),
          ),
        )
        .orderBy(asc(subscriptions.currentPeriodEnd))
        .limit(BATCH_SIZE);
      if (due.length === 0) break;

      for (const { id } of due) {
        const outcome = await this.renew(id, now);
        if (outcome.kind === "canceled") summary.canceled++;
        if (outcome.kind !== "renewed") continue;

        summary.renewed++;
        if (!outcome.invoiceId) continue;
        const { result } = await this.payments.pay(outcome.invoiceId);
        if (result.status === "succeeded") summary.paid++;
        else summary.failed++;
      }
    }

    return summary;
  }

  private renew(subscriptionId: string, now: Date): Promise<Outcome> {
    return this.db.transaction(async (tx) => {
      const repository = new SubscriptionRepository(tx);
      const subscription = await repository.findById(subscriptionId, { lock: true });
      if (
        !subscription ||
        (subscription.status !== "active" && subscription.status !== "trialing") ||
        subscription.currentPeriodEnd > now
      ) {
        return { kind: "skipped" };
      }

      if (subscription.cancelAtPeriodEnd) {
        await repository.update(subscription.id, {
          status: "canceled",
          canceledAt: subscription.currentPeriodEnd,
          updatedAt: now,
        });
        return { kind: "canceled" };
      }

      const plan = (await new PlanRepository(tx).findById(subscription.planId))!;
      const cycle = subscription.status === "trialing" ? 0 : subscription.cycle + 1;
      const period = billingPeriod(subscription.billingAnchor, plan.interval, cycle);

      const invoice = await this.invoices.issue(tx, subscription, plan, period);
      await repository.update(subscription.id, {
        cycle,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        updatedAt: now,
      });

      return { kind: "renewed", invoiceId: invoice?.id };
    });
  }
}
