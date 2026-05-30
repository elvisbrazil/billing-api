import { and, asc, eq, lte } from "drizzle-orm";
import type { Clock } from "../clock.js";
import type { Database } from "../db/client.js";
import { invoices } from "../db/schema.js";
import type { PaymentService } from "../modules/payments/payment.service.js";

export interface DunningSummary {
  attempted: number;
  recovered: number;
  uncollectible: number;
}

export class DunningJob {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly payments: PaymentService,
  ) {}

  async run(): Promise<DunningSummary> {
    const summary: DunningSummary = { attempted: 0, recovered: 0, uncollectible: 0 };
    const due = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.status, "open"), lte(invoices.nextPaymentAttemptAt, this.clock.now())))
      .orderBy(asc(invoices.nextPaymentAttemptAt));

    for (const { id } of due) {
      const { invoice } = await this.payments.pay(id);
      summary.attempted++;
      if (invoice.status === "paid") summary.recovered++;
      if (invoice.status === "uncollectible") summary.uncollectible++;
    }
    return summary;
  }
}
