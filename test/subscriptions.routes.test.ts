import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan } from "./support/fixtures.js";

describe("subscriptions routes", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("starts a trial when the plan has trial days", async () => {
    t.clock.set("2026-05-04T12:00:00Z");
    const plan = await createPlan(t, { trialDays: 14 });
    const customer = await createCustomer(t);

    const res = await t.app.inject({
      method: "POST",
      url: "/subscriptions",
      payload: { customerId: customer.id, planId: plan.id },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      status: "trialing",
      trialEnd: "2026-05-18T12:00:00.000Z",
      currentPeriodEnd: "2026-05-18T12:00:00.000Z",
    });
  });

  it("returns 422 when the customer does not exist", async () => {
    const plan = await createPlan(t);
    const res = await t.app.inject({
      method: "POST",
      url: "/subscriptions",
      payload: { customerId: "9b2f0c1e-7a3d-4e55-8c1a-2d4e6f8a0b1c", planId: plan.id },
    });
    expect(res.statusCode).toBe(422);
  });

  it("fetches a subscription by id", async () => {
    const plan = await createPlan(t, { trialDays: 7 });
    const customer = await createCustomer(t);
    const created = await t.app.inject({
      method: "POST",
      url: "/subscriptions",
      payload: { customerId: customer.id, planId: plan.id },
    });

    const res = await t.app.inject({ method: "GET", url: `/subscriptions/${created.json().id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().customerId).toBe(customer.id);
  });
});
