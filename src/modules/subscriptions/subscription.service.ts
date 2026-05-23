import { addDays, billingPeriod, formatDay } from "../../billing/period.js";
import { calculateProration, type Proration } from "../../billing/proration.js";
import type { Clock } from "../../clock.js";
import type { Database } from "../../db/client.js";
import { conflict, notFound, unprocessable } from "../../errors.js";
import { CustomerRepository } from "../customers/customer.repository.js";
import { InvoiceRepository, type Invoice } from "../invoices/invoice.repository.js";
import type { InvoiceService } from "../invoices/invoice.service.js";
import type { PaymentService } from "../payments/payment.service.js";
import { PlanRepository } from "../plans/plan.repository.js";
import { assertTransition } from "./lifecycle.js";
import { SubscriptionRepository, type Subscription } from "./subscription.repository.js";

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
}

export interface CreatedSubscription extends Subscription {
  latestInvoice: Invoice | null;
}

export interface PlanChange extends Subscription {
  proration: Proration | null;
}

export class SubscriptionService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
  ) {}

  async create(input: CreateSubscriptionInput): Promise<CreatedSubscription> {
    const customer = await new CustomerRepository(this.db).findById(input.customerId);
    if (!customer) throw unprocessable(`Customer ${input.customerId} does not exist`);
    const plan = await new PlanRepository(this.db).findById(input.planId);
    if (!plan) throw unprocessable(`Plan ${input.planId} does not exist`);

    const now = this.clock.now();

    if (plan.trialDays > 0) {
      const trialEnd = addDays(now, plan.trialDays);
      const subscription = await new SubscriptionRepository(this.db).insert({
        customerId: customer.id,
        planId: plan.id,
        status: "trialing",
        billingAnchor: trialEnd,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialEnd,
        createdAt: now,
        updatedAt: now,
      });
      return { ...subscription, latestInvoice: null };
    }

    const period = billingPeriod(now, plan.interval, 0);
    const created = await this.db.transaction(async (tx) => {
      const subscription = await new SubscriptionRepository(tx).insert({
        customerId: customer.id,
        planId: plan.id,
        status: "active",
        billingAnchor: now,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        createdAt: now,
        updatedAt: now,
      });
      const invoice = await this.invoices.issue(tx, subscription, plan, period);
      return { subscription, invoice: invoice! };
    });

    const { invoice } = await this.payments.pay(created.invoice.id);
    const subscription = await this.get(created.subscription.id);
    return { ...subscription, latestInvoice: invoice };
  }

  async cancel(id: string, options: { atPeriodEnd: boolean }): Promise<Subscription> {
    return this.db.transaction(async (tx) => {
      const subscriptions = new SubscriptionRepository(tx);
      const subscription = await subscriptions.findById(id, { lock: true });
      if (!subscription) throw notFound(`Subscription ${id} not found`);
      if (subscription.status === "canceled") {
        throw conflict(`Subscription ${id} is already canceled`);
      }

      const now = this.clock.now();
      if (options.atPeriodEnd) {
        return subscriptions.update(id, { cancelAtPeriodEnd: true, updatedAt: now });
      }

      assertTransition(subscription.status, "canceled");
      await new InvoiceRepository(tx).voidOpenForSubscription(id, now);
      return subscriptions.update(id, {
        status: "canceled",
        canceledAt: now,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      });
    });
  }

  async changePlan(id: string, planId: string): Promise<PlanChange> {
    return this.db.transaction(async (tx) => {
      const subscriptions = new SubscriptionRepository(tx);
      const plans = new PlanRepository(tx);

      const subscription = await subscriptions.findById(id, { lock: true });
      if (!subscription) throw notFound(`Subscription ${id} not found`);
      if (subscription.status !== "active" && subscription.status !== "trialing") {
        throw conflict(`Cannot change the plan of a ${subscription.status} subscription`);
      }
      if (subscription.planId === planId) {
        throw unprocessable("The subscription is already on this plan");
      }

      const current = (await plans.findById(subscription.planId))!;
      const next = await plans.findById(planId);
      if (!next) throw unprocessable(`Plan ${planId} does not exist`);
      if (next.interval !== current.interval || next.currency !== current.currency) {
        throw unprocessable("Plan changes must keep the same interval and currency");
      }

      const now = this.clock.now();
      if (subscription.status === "trialing") {
        const updated = await subscriptions.update(id, { planId, updatedAt: now });
        return { ...updated, proration: null };
      }

      const proration = calculateProration({
        currentPriceCents: current.priceCents,
        newPriceCents: next.priceCents,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        changeAt: now,
      });

      const item = {
        subscriptionId: id,
        kind: "proration" as const,
        periodStart: now,
        periodEnd: subscription.currentPeriodEnd,
        createdAt: now,
      };
      await new InvoiceRepository(tx).addPendingItems(
        [
          {
            ...item,
            description: `Unused time on ${current.name} after ${formatDay(now)}`,
            amountCents: proration.creditCents,
          },
          {
            ...item,
            description: `Remaining time on ${next.name} after ${formatDay(now)}`,
            amountCents: proration.chargeCents,
          },
        ].filter((line) => line.amountCents !== 0),
      );

      const updated = await subscriptions.update(id, { planId, updatedAt: now });
      return { ...updated, proration };
    });
  }

  async get(id: string): Promise<Subscription> {
    const subscription = await new SubscriptionRepository(this.db).findById(id);
    if (!subscription) throw notFound(`Subscription ${id} not found`);
    return subscription;
  }
}
