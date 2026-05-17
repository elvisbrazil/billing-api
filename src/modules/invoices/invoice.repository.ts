import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { invoiceCounters, invoiceLines, invoices } from "../../db/schema.js";

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type NewInvoiceLine = Omit<typeof invoiceLines.$inferInsert, "invoiceId">;

export class InvoiceRepository {
  constructor(private readonly db: Database) {}

  async insertDraft(invoice: NewInvoice, lines: NewInvoiceLine[]): Promise<Invoice | undefined> {
    const [created] = await this.db
      .insert(invoices)
      .values({ ...invoice, status: "draft" })
      .onConflictDoNothing({ target: [invoices.subscriptionId, invoices.periodStart] })
      .returning();
    if (!created) return undefined;

    if (lines.length > 0) {
      await this.db
        .insert(invoiceLines)
        .values(lines.map((line) => ({ ...line, invoiceId: created.id })));
    }
    return created;
  }

  async findById(id: string, options: { lock?: boolean } = {}): Promise<Invoice | undefined> {
    const query = this.db.select().from(invoices).where(eq(invoices.id, id));
    const [invoice] = options.lock ? await query.for("update") : await query;
    return invoice;
  }

  lines(invoiceId: string): Promise<InvoiceLine[]> {
    return this.db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.periodStart), asc(invoiceLines.kind));
  }

  listBySubscription(subscriptionId: string): Promise<Invoice[]> {
    return this.db
      .select()
      .from(invoices)
      .where(eq(invoices.subscriptionId, subscriptionId))
      .orderBy(desc(invoices.periodStart));
  }

  async update(id: string, patch: Partial<NewInvoice>): Promise<Invoice> {
    const [updated] = await this.db
      .update(invoices)
      .set(patch)
      .where(eq(invoices.id, id))
      .returning();
    return updated!;
  }

  voidOpenForSubscription(subscriptionId: string, now: Date): Promise<Invoice[]> {
    return this.db
      .update(invoices)
      .set({ status: "void", voidedAt: now, nextPaymentAttemptAt: null, updatedAt: now })
      .where(and(eq(invoices.subscriptionId, subscriptionId), eq(invoices.status, "open")))
      .returning();
  }

  async nextNumber(year: number): Promise<number> {
    await this.db.insert(invoiceCounters).values({ year }).onConflictDoNothing();
    const [counter] = await this.db
      .select()
      .from(invoiceCounters)
      .where(eq(invoiceCounters.year, year))
      .for("update");
    const next = counter!.lastNumber + 1;
    await this.db
      .update(invoiceCounters)
      .set({ lastNumber: next })
      .where(eq(invoiceCounters.year, year));
    return next;
  }
}
