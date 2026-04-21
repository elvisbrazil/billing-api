import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/app.js";

describe("plans routes", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("creates a plan with BRL as the default currency", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/plans",
      payload: { code: "basic-monthly", name: "Basic", interval: "month", priceCents: 2990 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      code: "basic-monthly",
      priceCents: 2990,
      currency: "BRL",
      trialDays: 0,
    });
  });

  it("rejects a duplicated code with 409", async () => {
    const payload = { code: "pro-yearly", name: "Pro", interval: "year", priceCents: 49900 };
    await t.app.inject({ method: "POST", url: "/plans", payload });
    const res = await t.app.inject({ method: "POST", url: "/plans", payload });

    expect(res.statusCode).toBe(409);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });

  it("rejects fractional prices", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/plans",
      payload: { code: "odd", name: "Odd", interval: "month", priceCents: 10.5 },
    });

    expect(res.statusCode).toBe(400);
  });

  it("lists plans ordered by price", async () => {
    const res = await t.app.inject({ method: "GET", url: "/plans" });
    const prices = res.json().map((p: { priceCents: number }) => p.priceCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("returns 404 for an unknown plan", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: "/plans/0b7f6a3e-8f43-4a8e-9a55-3f0d1c2b9e10",
    });
    expect(res.statusCode).toBe(404);
  });
});
