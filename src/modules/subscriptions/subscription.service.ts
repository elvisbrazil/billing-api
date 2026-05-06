import { addDays, billingPeriod } from "../../billing/period.js";
import type { Clock } from "../../clock.js";
import type { Database } from "../../db/client.js";
import { notFound, unprocessable } from "../../errors.js";
import { CustomerRepository } from "../customers/customer.repository.js";
import type { Invoice } from "../invoices/invoice.repository.js";
import type { InvoiceService } from "../invoices/invoice.service.js";
import type { PaymentService } from "../payments/payment.service.js";
import { PlanRepository } from "../plans/plan.repository.js";
import { SubscriptionRepository, type Subscription } from "./subscription.repository.js";

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
}

export interface CreatedSubscription extends Subscription {
  latestInvoice: Invoice | null;
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

  async get(id: string): Promise<Subscription> {
    const subscription = await new SubscriptionRepository(this.db).findById(id);
    if (!subscription) throw notFound(`Subscription ${id} not found`);
    return subscription;
  }
}
