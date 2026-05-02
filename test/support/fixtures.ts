import { randomUUID } from "node:crypto";
import type { TestApp } from "./app.js";

interface PlanOverrides {
  interval?: "month" | "year";
  priceCents?: number;
  trialDays?: number;
}

export async function createPlan(t: TestApp, overrides: PlanOverrides = {}) {
  const res = await t.app.inject({
    method: "POST",
    url: "/plans",
    payload: {
      code: `plan-${randomUUID().slice(0, 8)}`,
      name: "Test plan",
      interval: "month",
      priceCents: 4990,
      ...overrides,
    },
  });
  return res.json<{ id: string; priceCents: number }>();
}

export async function createCustomer(t: TestApp, email = `${randomUUID()}@example.com`) {
  const res = await t.app.inject({
    method: "POST",
    url: "/customers",
    payload: { name: "Test customer", email },
  });
  return res.json<{ id: string; email: string }>();
}

export async function subscribe(t: TestApp, customerId: string, planId: string) {
  const res = await t.app.inject({
    method: "POST",
    url: "/subscriptions",
    payload: { customerId, planId },
  });
  return res.json();
}
