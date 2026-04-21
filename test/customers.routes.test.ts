import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/app.js";

describe("customers routes", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("creates and fetches a customer", async () => {
    const created = await t.app.inject({
      method: "POST",
      url: "/customers",
      payload: { name: "Ana Souza", email: "Ana@Example.com" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().email).toBe("ana@example.com");

    const fetched = await t.app.inject({ method: "GET", url: `/customers/${created.json().id}` });
    expect(fetched.json().name).toBe("Ana Souza");
  });

  it("does not allow two customers with the same email", async () => {
    const payload = { name: "Bruno", email: "bruno@example.com" };
    await t.app.inject({ method: "POST", url: "/customers", payload });
    const res = await t.app.inject({
      method: "POST",
      url: "/customers",
      payload: { ...payload, email: "BRUNO@example.com" },
    });
    expect(res.statusCode).toBe(409);
  });
});
