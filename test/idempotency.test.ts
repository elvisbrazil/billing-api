import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/app.js";
import { createCustomer, createPlan } from "./support/fixtures.js";

describe("Idempotency-Key", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("creates a single subscription when POST /subscriptions is retried", async () => {
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const request = {
      method: "POST" as const,
      url: "/subscriptions",
      headers: { "idempotency-key": "sub-retry-1" },
      payload: { customerId: customer.id, planId: plan.id },
    };

    const first = await t.app.inject(request);
    const second = await t.app.inject(request);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.json().id).toBe(first.json().id);
    expect(t.gateway.charges.filter((c) => c.customer.id === customer.id)).toHaveLength(1);
  });

  it("rejects the same key with a different body", async () => {
    const plan = await createPlan(t);
    const first = await createCustomer(t);
    const second = await createCustomer(t);
    const headers = { "idempotency-key": "sub-reuse" };

    await t.app.inject({
      method: "POST",
      url: "/subscriptions",
      headers,
      payload: { customerId: first.id, planId: plan.id },
    });
    const res = await t.app.inject({
      method: "POST",
      url: "/subscriptions",
      headers,
      payload: { customerId: second.id, planId: plan.id },
    });

    expect(res.statusCode).toBe(422);
  });

  it("replays a declined payment instead of charging again", async () => {
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    t.gateway.willFailFor(customer.id);
    const subscription = await t.app.inject({
      method: "POST",
      url: "/subscriptions",
      payload: { customerId: customer.id, planId: plan.id },
    });
    const invoiceId = subscription.json().latestInvoice.id;
    const pay = {
      method: "POST" as const,
      url: `/invoices/${invoiceId}/pay`,
      headers: { "idempotency-key": "pay-1" },
    };

    const first = await t.app.inject(pay);
    t.gateway.willSucceedFor(customer.id);
    const second = await t.app.inject(pay);

    expect(first.statusCode).toBe(402);
    expect(second.statusCode).toBe(402);
    expect(second.headers["content-type"]).toContain("application/problem+json");
    expect(t.gateway.charges.filter((c) => c.invoiceId === invoiceId)).toHaveLength(2);
  });

  it("scopes keys per endpoint", async () => {
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const subscription = await t.app.inject({
      method: "POST",
      url: "/subscriptions",
      headers: { "idempotency-key": "shared-key" },
      payload: { customerId: customer.id, planId: plan.id },
    });
    t.gateway.willFailFor(customer.id);

    const res = await t.app.inject({
      method: "POST",
      url: `/invoices/${subscription.json().latestInvoice.id}/pay`,
      headers: { "idempotency-key": "shared-key" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
  });

  it("does not interfere when the header is absent", async () => {
    const plan = await createPlan(t);
    const customer = await createCustomer(t);
    const payload = { customerId: customer.id, planId: plan.id };

    const first = await t.app.inject({ method: "POST", url: "/subscriptions", payload });
    const second = await t.app.inject({ method: "POST", url: "/subscriptions", payload });

    expect(second.json().id).not.toBe(first.json().id);
  });
});
