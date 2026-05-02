import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan, subscribe } from "./support/fixtures.js";

describe("invoices routes", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set("2026-05-04T12:00:00Z");
  });

  afterAll(async () => {
    await t.close();
  });

  it("issues a numbered invoice for the first period when there is no trial", async () => {
    const plan = await createPlan(t, { priceCents: 3990 });
    const customer = await createCustomer(t);

    const subscription = await subscribe(t, customer.id, plan.id);

    expect(subscription.latestInvoice).toMatchObject({
      number: "2026-000001",
      status: "open",
      totalCents: 3990,
      periodStart: "2026-05-04T12:00:00.000Z",
      periodEnd: "2026-06-04T12:00:00.000Z",
    });
  });

  it("returns the invoice with its lines", async () => {
    const plan = await createPlan(t, { priceCents: 1500 });
    const customer = await createCustomer(t);
    const { latestInvoice } = await subscribe(t, customer.id, plan.id);

    const res = await t.app.inject({ method: "GET", url: `/invoices/${latestInvoice.id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().lines).toEqual([
      expect.objectContaining({
        kind: "subscription",
        amountCents: 1500,
        description: "Test plan (2026-05-04 to 2026-06-04)",
      }),
    ]);
  });

  it("lists invoices of a subscription", async () => {
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const subscription = await subscribe(t, customer.id, plan.id);

    const res = await t.app.inject({
      method: "GET",
      url: `/subscriptions/${subscription.id}/invoices`,
    });

    expect(res.json()).toHaveLength(1);
  });

  it("voids an open invoice only once", async () => {
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const { latestInvoice } = await subscribe(t, customer.id, plan.id);

    const first = await t.app.inject({ method: "POST", url: `/invoices/${latestInvoice.id}/void` });
    const second = await t.app.inject({
      method: "POST",
      url: `/invoices/${latestInvoice.id}/void`,
    });

    expect(first.json()).toMatchObject({ status: "void", number: latestInvoice.number });
    expect(second.statusCode).toBe(409);
  });
});
