import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const DATABASE_URL = "postgres://billing:billing@localhost:5432/billing";

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig({ DATABASE_URL });
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe("info");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ DATABASE_URL, PORT: "abc" })).toThrow(/Invalid environment/);
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
