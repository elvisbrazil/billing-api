import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { FakePaymentGateway } from "../src/payments/fake-gateway.js";
import { createTestDatabase } from "./support/db.js";

describe("GET /health", () => {
  let app: App;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const database = await createTestDatabase();
    closeDb = database.close;
    app = buildApp({ db: database.db, gateway: new FakePaymentGateway() });
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("responds with ok when the database is reachable", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
