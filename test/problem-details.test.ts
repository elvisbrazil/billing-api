import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp, type App } from "../src/app.js";
import { conflict } from "../src/errors.js";
import { FakePaymentGateway } from "../src/payments/fake-gateway.js";
import { createTestDatabase } from "./support/db.js";

describe("problem details", () => {
  let app: App;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const database = await createTestDatabase();
    closeDb = database.close;
    app = buildApp({ db: database.db, gateway: new FakePaymentGateway() });
    app.get("/boom", async () => {
      throw new Error("kaboom");
    });
    app.get("/taken", async () => {
      throw conflict("Already taken", { field: "code" });
    });
    app.post("/echo", { schema: { body: z.object({ amount: z.number().int() }) } }, async (req) => {
      return req.body;
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("renders unknown routes as 404 problem+json", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json()).toMatchObject({ status: 404, title: "Not Found", instance: "/nope" });
  });

  it("keeps extension members of domain errors", async () => {
    const res = await app.inject({ method: "GET", url: "/taken" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ title: "Conflict", detail: "Already taken", field: "code" });
  });

  it("lists validation issues", async () => {
    const res = await app.inject({ method: "POST", url: "/echo", payload: { amount: 1.5 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors).toHaveLength(1);
  });

  it("uses the matching title for framework errors", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "text/csv" },
      payload: "amount\n1",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().title).toBe("Unsupported Media Type");
  });

  it("hides internal error messages", async () => {
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      type: "about:blank",
      status: 500,
      title: "Internal Server Error",
      instance: "/boom",
    });
  });
});
