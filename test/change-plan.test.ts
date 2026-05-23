import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pendingInvoiceItems } from "../src/db/schema.js";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan, subscribe } from "./support/fixtures.js";

describe("POST /subscriptions/:id/change-plan", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  function changePlan(subscriptionId: string, planId: string) {
    return t.app.inject({
      method: "POST",
      url: `/subscriptions/${subscriptionId}/change-plan`,
      payload: { planId },
    });
  }

  it("records proration items for the next invoice on an upgrade", async () => {
    t.clock.set("2026-06-01T00:00:00Z");
    const basic = await createPlan(t, { priceCents: 3000 });
    const premium = await createPlan(t, { priceCents: 9000 });
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, basic.id);

    t.clock.advanceDays(15);
    const res = await changePlan(subscription.id, premium.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      planId: premium.id,
      proration: { creditCents: -1500, chargeCents: 4500, netCents: 3000 },
    });

    const items = await t.db
      .select()
      .from(pendingInvoiceItems)
      .where(eq(pendingInvoiceItems.subscriptionId, subscription.id));
    expect(items.map((item) => item.amountCents).sort((a, b) => a - b)).toEqual([-1500, 4500]);
    expect(items.every((item) => item.invoiceId === null)).toBe(true);
  });

  it("switches plans during a trial without prorating", async () => {
    const basic = await createPlan(t, { priceCents: 3000, trialDays: 7 });
    const premium = await createPlan(t, { priceCents: 9000 });
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, basic.id);

    const res = await changePlan(subscription.id, premium.id);

    expect(res.json()).toMatchObject({ status: "trialing", planId: premium.id, proration: null });
  });

  it("refuses to move between monthly and yearly plans", async () => {
    const monthly = await createPlan(t, { interval: "month" });
    const yearly = await createPlan(t, { interval: "year" });
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, monthly.id);

    const res = await changePlan(subscription.id, yearly.id);

    expect(res.statusCode).toBe(422);
  });

  it("refuses to change the plan of a past_due subscription", async () => {
    const basic = await createPlan(t);
    const premium = await createPlan(t);
    const customer = await createCustomer(t);
    t.gateway.willFailFor(customer.id);
    const subscription = await subscribe(t, customer.id, basic.id);

    const res = await changePlan(subscription.id, premium.id);

    expect(res.statusCode).toBe(409);
  });
});
