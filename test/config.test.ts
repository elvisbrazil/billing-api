import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe("info");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid environment/);
  });
});
