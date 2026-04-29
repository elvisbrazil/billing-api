import { addDays, billingPeriod } from "../../billing/period.js";
import type { Clock } from "../../clock.js";
import { notFound, unprocessable } from "../../errors.js";
import type { CustomerRepository } from "../customers/customer.repository.js";
import type { PlanRepository } from "../plans/plan.repository.js";
import type { Subscription, SubscriptionRepository } from "./subscription.repository.js";

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
}

export class SubscriptionService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly customers: CustomerRepository,
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const customer = await this.customers.findById(input.customerId);
    if (!customer) throw unprocessable(`Customer ${input.customerId} does not exist`);
    const plan = await this.plans.findById(input.planId);
    if (!plan) throw unprocessable(`Plan ${input.planId} does not exist`);

    const now = this.clock.now();

    if (plan.trialDays > 0) {
      const trialEnd = addDays(now, plan.trialDays);
      return this.subscriptions.insert({
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
    }

    const period = billingPeriod(now, plan.interval, 0);
    return this.subscriptions.insert({
      customerId: customer.id,
      planId: plan.id,
      status: "active",
      billingAnchor: now,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(id: string): Promise<Subscription> {
    const subscription = await this.subscriptions.findById(id);
    if (!subscription) throw notFound(`Subscription ${id} not found`);
    return subscription;
  }
}
