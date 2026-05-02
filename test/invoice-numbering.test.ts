import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/billing/period.js";
import { InvoiceRepository } from "../src/modules/invoices/invoice.repository.js";
import { formatInvoiceNumber, InvoiceService } from "../src/modules/invoices/invoice.service.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan, subscribe } from "./support/fixtures.js";

describe("invoice numbering", () => {
  let t: TestApp;
  let service: InvoiceService;

  beforeEach(async () => {
    t = await createTestApp();
    t.clock.set("2026-12-31T23:00:00Z");
    service = new InvoiceService(t.db, t.clock);
  });

  afterEach(async () => {
    await t.close();
  });

  async function createDrafts(count: number): Promise<string[]> {
    const plan = await createPlan(t, { trialDays: 30 });
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);
    const repository = new InvoiceRepository(t.db);
    const base = new Date("2027-01-01T00:00:00Z");

    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const draft = await repository.insertDraft(
        {
          subscriptionId: subscription.id,
          customerId: customer.id,
          currency: "BRL",
          periodStart: addDays(base, i),
          periodEnd: addDays(base, i + 1),
          totalCents: 100,
          createdAt: t.clock.now(),
          updatedAt: t.clock.now(),
        },
        [],
      );
      ids.push(draft!.id);
    }
    return ids;
  }

  it("formats numbers as year plus six digits", () => {
    expect(formatInvoiceNumber(2026, 123)).toBe("2026-000123");
  });

  it("hands out contiguous numbers to concurrent finalizations", async () => {
    const ids = await createDrafts(25);

    const finalized = await Promise.all(ids.map((id) => service.finalize(id)));

    const numbers = finalized.map((invoice) => invoice.number).sort();
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => formatInvoiceNumber(2026, i + 1)));
  });

  it("does not burn a number when the transaction rolls back", async () => {
    const [first, second] = await createDrafts(2);

    await expect(
      t.db.transaction(async (tx) => {
        await service.finalize(first!, tx);
        throw new Error("payment provider exploded");
      }),
    ).rejects.toThrow("payment provider exploded");

    const invoice = await service.finalize(second!);
    expect(invoice.number).toBe("2026-000001");
  });

  it("restarts the sequence each year", async () => {
    const [last2026, first2027] = await createDrafts(2);

    await service.finalize(last2026!);
    t.clock.set("2027-01-01T00:00:01Z");
    const invoice = await service.finalize(first2027!);

    expect(invoice.number).toBe("2027-000001");
  });
});
