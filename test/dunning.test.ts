import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextRetryAt } from "../src/billing/dunning.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan, subscribe } from "./support/fixtures.js";

describe("nextRetryAt", () => {
  const firstFailure = new Date("2026-05-01T10:00:00Z");

  it("schedules retries 1, 3 and 7 days after the first failure", () => {
    expect(nextRetryAt(firstFailure, 1)).toEqual(new Date("2026-05-02T10:00:00Z"));
    expect(nextRetryAt(firstFailure, 2)).toEqual(new Date("2026-05-04T10:00:00Z"));
    expect(nextRetryAt(firstFailure, 3)).toEqual(new Date("2026-05-08T10:00:00Z"));
  });

  it("gives up after the last retry", () => {
    expect(nextRetryAt(firstFailure, 4)).toBeNull();
  });
});

describe("dunning job", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function failingSubscription() {
    t.clock.set("2026-05-01T10:00:00Z");
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    t.gateway.willFailFor(customer.id);
    const subscription = await subscribe(t, customer.id, plan.id);
    return { customer, subscription, invoiceId: subscription.latestInvoice.id as string };
  }

  async function state(subscriptionId: string, invoiceId: string) {
    const [subscription, invoice] = await Promise.all([
      t.app.inject({ method: "GET", url: `/subscriptions/${subscriptionId}` }),
      t.app.inject({ method: "GET", url: `/invoices/${invoiceId}` }),
    ]);
    return { subscription: subscription.json(), invoice: invoice.json() };
  }

  it("retries on schedule and cancels the subscription when all retries fail", async () => {
    const { subscription, invoiceId } = await failingSubscription();
    expect((await state(subscription.id, invoiceId)).invoice).toMatchObject({
      attemptCount: 1,
      nextPaymentAttemptAt: "2026-05-02T10:00:00.000Z",
    });

    t.clock.set("2026-05-02T09:59:59Z");
    expect((await t.services.dunning.run()).attempted).toBe(0);

    t.clock.set("2026-05-02T10:00:00Z");
    await t.services.dunning.run();
    expect((await state(subscription.id, invoiceId)).invoice).toMatchObject({
      attemptCount: 2,
      nextPaymentAttemptAt: "2026-05-04T10:00:00.000Z",
    });

    t.clock.set("2026-05-04T10:00:00Z");
    await t.services.dunning.run();
    expect((await state(subscription.id, invoiceId)).invoice).toMatchObject({
      attemptCount: 3,
      nextPaymentAttemptAt: "2026-05-08T10:00:00.000Z",
    });
    expect((await state(subscription.id, invoiceId)).subscription.status).toBe("past_due");

    t.clock.set("2026-05-08T10:00:00Z");
    const summary = await t.services.dunning.run();

    expect(summary).toMatchObject({ attempted: 1, uncollectible: 1 });
    const final = await state(subscription.id, invoiceId);
    expect(final.invoice).toMatchObject({
      status: "uncollectible",
      attemptCount: 4,
      nextPaymentAttemptAt: null,
    });
    expect(final.subscription).toMatchObject({
      status: "canceled",
      canceledAt: "2026-05-08T10:00:00.000Z",
    });
  });

  it("reactivates the subscription when a retry succeeds", async () => {
    const { customer, subscription, invoiceId } = await failingSubscription();

    t.clock.set("2026-05-02T10:00:00Z");
    await t.services.dunning.run();
    t.gateway.willSucceedFor(customer.id);
    t.clock.set("2026-05-04T10:00:00Z");
    await t.services.dunning.run();

    const { invoice, subscription: after } = await state(subscription.id, invoiceId);
    expect(invoice).toMatchObject({ status: "paid", attemptCount: 3, nextPaymentAttemptAt: null });
    expect(after.status).toBe("active");
  });

  it("does not retry an invoice voided by an immediate cancellation", async () => {
    const { subscription } = await failingSubscription();
    await t.app.inject({
      method: "POST",
      url: `/subscriptions/${subscription.id}/cancel`,
      payload: { atPeriodEnd: false },
    });
    const chargesBefore = t.gateway.charges.length;

    t.clock.set("2026-05-09T00:00:00Z");
    await t.services.dunning.run();

    expect(t.gateway.charges).toHaveLength(chargesBefore);
  });
});
