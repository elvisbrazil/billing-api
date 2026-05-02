import type { Period } from "../../billing/period.js";
import type { Clock } from "../../clock.js";
import type { Database } from "../../db/client.js";
import { conflict, notFound } from "../../errors.js";
import type { Plan } from "../plans/plan.repository.js";
import type { Subscription } from "../subscriptions/subscription.repository.js";
import { InvoiceRepository, type Invoice, type NewInvoiceLine } from "./invoice.repository.js";

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, "0")}`;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
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
    const lines: NewInvoiceLine[] = [
      {
        kind: "subscription",
        description: `${plan.name} (${day(period.start)} to ${day(period.end)})`,
        amountCents: plan.priceCents,
        periodStart: period.start,
        periodEnd: period.end,
      },
    ];
    const total = lines.reduce((sum, line) => sum + line.amountCents, 0);

    const repository = new InvoiceRepository(tx);
    const draft = await repository.insertDraft(
      {
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        currency: plan.currency,
        periodStart: period.start,
        periodEnd: period.end,
        totalCents: total,
        createdAt: now,
        updatedAt: now,
      },
      lines,
    );
    if (!draft) return undefined;

    return this.finalize(draft.id, tx);
  }

  async finalize(invoiceId: string, tx: Database = this.db): Promise<Invoice> {
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
