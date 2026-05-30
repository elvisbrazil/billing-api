import type { Clock } from "./clock.js";
import type { Database } from "./db/client.js";
import { CustomerRepository } from "./modules/customers/customer.repository.js";
import { CustomerService } from "./modules/customers/customer.service.js";
import { InvoiceService } from "./modules/invoices/invoice.service.js";
import { PaymentService } from "./modules/payments/payment.service.js";
import { PlanRepository } from "./modules/plans/plan.repository.js";
import { PlanService } from "./modules/plans/plan.service.js";
import { SubscriptionService } from "./modules/subscriptions/subscription.service.js";
import { DunningJob } from "./jobs/dunning.js";
import { RenewalJob } from "./jobs/renewal.js";
import type { PaymentGateway } from "./payments/gateway.js";

export interface Dependencies {
  db: Database;
  clock: Clock;
  gateway: PaymentGateway;
}

export function createServices({ db, clock, gateway }: Dependencies) {
  const invoices = new InvoiceService(db, clock);
  const payments = new PaymentService(db, clock, gateway);

  return {
    plans: new PlanService(new PlanRepository(db)),
    customers: new CustomerService(new CustomerRepository(db)),
    invoices,
    payments,
    subscriptions: new SubscriptionService(db, clock, invoices, payments),
    renewal: new RenewalJob(db, clock, invoices, payments),
    dunning: new DunningJob(db, clock, payments),
  };
}

export type Services = ReturnType<typeof createServices>;
