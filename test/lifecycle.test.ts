import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../src/modules/subscriptions/lifecycle.js";

describe("subscription lifecycle", () => {
  it.each([
    ["trialing", "active"],
    ["trialing", "past_due"],
    ["active", "past_due"],
    ["past_due", "active"],
    ["past_due", "canceled"],
    ["active", "canceled"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["canceled", "active"],
    ["canceled", "trialing"],
    ["active", "trialing"],
    ["past_due", "trialing"],
  ] as const)("forbids %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("throws a 409 problem for forbidden transitions", () => {
    expect(() => assertTransition("canceled", "active")).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });
});
