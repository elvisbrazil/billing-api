import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan, subscribe } from "./support/fixtures.js";

describe("POST /subscriptions/:id/cancel", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function newSubscription(options: { failing?: boolean } = {}) {
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    if (options.failing) t.gateway.willFailFor(customer.id);
    return subscribe(t, customer.id, plan.id);
  }

  it("cancels at period end by default and keeps the subscription active", async () => {
    const subscription = await newSubscription();

    const res = await t.app.inject({
      method: "POST",
      url: `/subscriptions/${subscription.id}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
      canceledAt: null,
    });
  });

  it("cancels immediately and voids open invoices", async () => {
    const subscription = await newSubscription({ failing: true });

    const res = await t.app.inject({
      method: "POST",
      url: `/subscriptions/${subscription.id}/cancel`,
      payload: { atPeriodEnd: false },
    });

    expect(res.json()).toMatchObject({
      status: "canceled",
      canceledAt: t.clock.now().toISOString(),
    });
    const invoice = await t.app.inject({
      method: "GET",
      url: `/invoices/${subscription.latestInvoice.id}`,
    });
    expect(invoice.json().status).toBe("void");
  });

  it("returns 409 when the subscription is already canceled", async () => {
    const subscription = await newSubscription();
    const cancel = {
      method: "POST" as const,
      url: `/subscriptions/${subscription.id}/cancel`,
      payload: { atPeriodEnd: false },
    };

    await t.app.inject(cancel);
    const res = await t.app.inject(cancel);

    expect(res.statusCode).toBe(409);
  });
});
