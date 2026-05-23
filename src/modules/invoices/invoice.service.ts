import { formatDay, type Period } from "../../billing/period.js";
import type { Clock } from "../../clock.js";
import type { Database } from "../../db/client.js";
import { conflict, notFound } from "../../errors.js";
import type { Plan } from "../plans/plan.repository.js";
import type { Subscription } from "../subscriptions/subscription.repository.js";
import { InvoiceRepository, type Invoice, type NewInvoiceLine } from "./invoice.repository.js";

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, "0")}`;
}

export class InvoiceService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async issue(
    tx: Database,
    subscription: Subscription,
    plan: Plan,
    period: Period,
  ): Promise<Invoice | undefined> {
    const now = this.clock.now();
    const repository = new InvoiceRepository(tx);
    const pending = await repository.pendingItems(subscription.id);

    const lines: NewInvoiceLine[] = [
      {
        kind: "subscription",
        description: `${plan.name} (${formatDay(period.start)} to ${formatDay(period.end)})`,
        amountCents: plan.priceCents,
        periodStart: period.start,
        periodEnd: period.end,
      },
      ...pending.map(({ kind, description, amountCents, periodStart, periodEnd }) => ({
        kind,
        description,
        amountCents,
        periodStart,
        periodEnd,
      })),
    ];

    const subtotal = lines.reduce((sum, line) => sum + line.amountCents, 0);
    if (subtotal < 0) {
      lines.push({
        kind: "credit",
        description: "Unused credit carried over to the next invoice",
        amountCents: -subtotal,
        periodStart: period.start,
        periodEnd: period.end,
      });
    }

    const draft = await repository.insertDraft(
      {
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        currency: plan.currency,
        periodStart: period.start,
        periodEnd: period.end,
        totalCents: Math.max(0, subtotal),
        createdAt: now,
        updatedAt: now,
      },
      lines,
    );
    if (!draft) return undefined;

    await repository.attachPendingItems(
      pending.map((item) => item.id),
      draft.id,
    );
    if (subtotal < 0) {
      await repository.addPendingItems([
        {
          subscriptionId: subscription.id,
          kind: "credit",
          description: "Credit carried over from a previous invoice",
          amountCents: subtotal,
          periodStart: period.start,
          periodEnd: period.end,
          createdAt: now,
        },
      ]);
    }

    return this.finalize(draft.id, tx);
  }

  async finalize(invoiceId: string, executor: Database = this.db): Promise<Invoice> {
    return executor.transaction(async (tx) => {
      const repository = new InvoiceRepository(tx);
      const invoice = await repository.findById(invoiceId, { lock: true });
      if (!invoice) throw notFound(`Invoice ${invoiceId} not found`);
      if (invoice.status !== "draft") {
        throw conflict(`Invoice ${invoice.id} is ${invoice.status}, only drafts can be finalized`);
      }

      const now = this.clock.now();
      const year = now.getUTCFullYear();
      const sequence = await repository.nextNumber(year);

      return repository.update(invoice.id, {
        number: formatInvoiceNumber(year, sequence),
        status: "open",
        finalizedAt: now,
        updatedAt: now,
      });
    });
  }

  async get(id: string) {
    const repository = new InvoiceRepository(this.db);
    const invoice = await repository.findById(id);
    if (!invoice) throw notFound(`Invoice ${id} not found`);
    return { ...invoice, lines: await repository.lines(id) };
  }

  listForSubscription(subscriptionId: string): Promise<Invoice[]> {
    return new InvoiceRepository(this.db).listBySubscription(subscriptionId);
  }

  async void(id: string): Promise<Invoice> {
    return this.db.transaction(async (tx) => {
      const repository = new InvoiceRepository(tx);
      const invoice = await repository.findById(id, { lock: true });
      if (!invoice) throw notFound(`Invoice ${id} not found`);
      if (invoice.status !== "open") {
        throw conflict(`Invoice ${id} is ${invoice.status}, only open invoices can be voided`);
      }
      const now = this.clock.now();
      return repository.update(id, {
        status: "void",
        voidedAt: now,
        nextPaymentAttemptAt: null,
        updatedAt: now,
      });
    });
  }
}
