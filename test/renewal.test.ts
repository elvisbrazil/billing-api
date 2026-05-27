import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan, subscribe } from "./support/fixtures.js";

describe("renewal job", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function getSubscription(id: string) {
    const res = await t.app.inject({ method: "GET", url: `/subscriptions/${id}` });
    return res.json();
  }

  async function listInvoices(subscriptionId: string) {
    const res = await t.app.inject({
      method: "GET",
      url: `/subscriptions/${subscriptionId}/invoices`,
    });
    return res.json();
  }

  async function invoiceLines(invoiceId: string) {
    const res = await t.app.inject({ method: "GET", url: `/invoices/${invoiceId}` });
    return res.json().lines;
  }

  it("bills the first period when a trial ends", async () => {
    t.clock.set("2026-03-01T09:00:00Z");
    const plan = await createPlan(t, { priceCents: 2990, trialDays: 14 });
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);

    t.clock.set("2026-03-15T09:00:00Z");
    await t.services.renewal.run();

    expect(await getSubscription(subscription.id)).toMatchObject({
      status: "active",
      currentPeriodStart: "2026-03-15T09:00:00.000Z",
      currentPeriodEnd: "2026-04-15T09:00:00.000Z",
    });
    const [invoice] = await listInvoices(subscription.id);
    expect(invoice).toMatchObject({ status: "paid", totalCents: 2990 });
  });

  it("issues one invoice per period no matter how many times it runs", async () => {
    t.clock.set("2026-04-10T10:00:00Z");
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);

    t.clock.set("2026-05-10T10:00:00Z");
    await Promise.all([t.services.renewal.run(), t.services.renewal.run()]);
    await t.services.renewal.run();

    const invoices = await listInvoices(subscription.id);
    expect(invoices).toHaveLength(2);
    expect(invoices[0].periodStart).toBe("2026-05-10T10:00:00.000Z");
  });

  it("follows month ends from a Jan 31 anchor", async () => {
    t.clock.set("2026-01-31T15:00:00Z");
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);

    t.clock.set("2026-02-28T15:00:00Z");
    await t.services.renewal.run();
    t.clock.set("2026-03-31T15:00:00Z");
    await t.services.renewal.run();

    const periods = (await listInvoices(subscription.id)).map((invoice: { periodStart: string }) =>
      invoice.periodStart.slice(0, 10),
    );
    expect(periods).toEqual(["2026-03-31", "2026-02-28", "2026-01-31"]);
  });

  it("catches up on every missed period", async () => {
    t.clock.set("2026-01-05T08:00:00Z");
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);

    t.clock.set("2026-04-06T08:00:00Z");
    const summary = await t.services.renewal.run();

    expect(summary.renewed).toBeGreaterThanOrEqual(3);
    expect(await listInvoices(subscription.id)).toHaveLength(4);
    expect((await getSubscription(subscription.id)).currentPeriodEnd).toBe(
      "2026-05-05T08:00:00.000Z",
    );
  });

  it("cancels subscriptions flagged to cancel at period end", async () => {
    t.clock.set("2026-06-01T12:00:00Z");
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);
    await t.app.inject({ method: "POST", url: `/subscriptions/${subscription.id}/cancel` });

    t.clock.set("2026-07-02T12:00:00Z");
    await t.services.renewal.run();

    expect(await getSubscription(subscription.id)).toMatchObject({
      status: "canceled",
      canceledAt: "2026-07-01T12:00:00.000Z",
    });
    expect(await listInvoices(subscription.id)).toHaveLength(1);
  });

  it("puts proration items on the renewal invoice", async () => {
    t.clock.set("2026-06-01T00:00:00Z");
    const basic = await createPlan(t, { priceCents: 3000 });
    const premium = await createPlan(t, { priceCents: 9000 });
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, basic.id);
    t.clock.advanceDays(15);
    await t.app.inject({
      method: "POST",
      url: `/subscriptions/${subscription.id}/change-plan`,
      payload: { planId: premium.id },
    });

    t.clock.set("2026-07-01T00:00:00Z");
    await t.services.renewal.run();

    const [renewal] = await listInvoices(subscription.id);
    expect(renewal.totalCents).toBe(9000 - 1500 + 4500);
    const amounts = (await invoiceLines(renewal.id)).map(
      (line: { amountCents: number }) => line.amountCents,
    );
    expect(amounts.sort((a: number, b: number) => a - b)).toEqual([-1500, 4500, 9000]);
  });

  it("carries leftover credit from a downgrade to the following invoice", async () => {
    t.clock.set("2026-06-01T00:00:00Z");
    const premium = await createPlan(t, { priceCents: 90000 });
    const basic = await createPlan(t, { priceCents: 1000 });
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, premium.id);
    t.clock.advanceDays(3);
    await t.app.inject({
      method: "POST",
      url: `/subscriptions/${subscription.id}/change-plan`,
      payload: { planId: basic.id },
    });

    t.clock.set("2026-07-01T00:00:00Z");
    await t.services.renewal.run();
    t.clock.set("2026-08-01T00:00:00Z");
    await t.services.renewal.run();

    const [august, july] = await listInvoices(subscription.id);
    expect(july.totalCents).toBe(0);
    expect(july.status).toBe("paid");
    expect(august.totalCents).toBe(0);
    const carriedFromJuly = 1000 - 81000 + 900;
    expect(await invoiceLines(august.id)).toContainEqual(
      expect.objectContaining({ kind: "credit", amountCents: carriedFromJuly }),
    );
  });

  it("moves to past_due when the renewal charge fails and stops renewing", async () => {
    t.clock.set("2026-06-10T00:00:00Z");
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);
    t.gateway.willFailFor(customer.id);

    t.clock.set("2026-07-10T00:00:00Z");
    await t.services.renewal.run();
    t.clock.set("2026-08-10T00:00:00Z");
    await t.services.renewal.run();

    expect((await getSubscription(subscription.id)).status).toBe("past_due");
    expect(await listInvoices(subscription.id)).toHaveLength(2);
  });
});
