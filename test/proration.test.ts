import { describe, expect, it } from "vitest";
import { calculateProration, prorateAmount } from "../src/billing/proration.js";

const periodStart = new Date("2026-06-01T00:00:00Z");
const periodEnd = new Date("2026-07-01T00:00:00Z");

describe("prorateAmount", () => {
  it("rounds half up to the cent", () => {
    expect(prorateAmount(5, 1, 2)).toBe(3);
    expect(prorateAmount(5, 1, 4)).toBe(1);
    expect(prorateAmount(7, 3, 4)).toBe(5);
  });

  it("returns the full price for the full period", () => {
    expect(prorateAmount(4990, 2_592_000, 2_592_000)).toBe(4990);
  });

  it("does not lose precision for large amounts", () => {
    expect(prorateAmount(999_999_999, 31_535_999, 31_536_000)).toBe(999_999_967);
  });
});

describe("calculateProration", () => {
  it("credits unused time and charges the remaining time on an upgrade", () => {
    const proration = calculateProration({
      currentPriceCents: 3000,
      newPriceCents: 9000,
      periodStart,
      periodEnd,
      changeAt: new Date("2026-06-16T00:00:00Z"),
    });

    expect(proration).toEqual({ creditCents: -1500, chargeCents: 4500, netCents: 3000 });
  });

  it("produces a negative net on a downgrade", () => {
    const proration = calculateProration({
      currentPriceCents: 9000,
      newPriceCents: 3000,
      periodStart,
      periodEnd,
      changeAt: new Date("2026-06-21T00:00:00Z"),
    });

    expect(proration).toEqual({ creditCents: -3000, chargeCents: 1000, netCents: -2000 });
  });

  it("rounds each line separately so the net matches the lines", () => {
    const proration = calculateProration({
      currentPriceCents: 4990,
      newPriceCents: 7990,
      periodStart,
      periodEnd,
      changeAt: new Date("2026-06-11T08:00:00Z"),
    });

    expect(proration.creditCents).toBe(-3271);
    expect(proration.chargeCents).toBe(5238);
    expect(proration.netCents).toBe(proration.chargeCents + proration.creditCents);
  });

  it("is zero at the very end of the period", () => {
    const proration = calculateProration({
      currentPriceCents: 4990,
      newPriceCents: 7990,
      periodStart,
      periodEnd,
      changeAt: periodEnd,
    });

    expect(proration.netCents).toBe(0);
  });

  it("never prorates more than the full period", () => {
    const proration = calculateProration({
      currentPriceCents: 1000,
      newPriceCents: 2000,
      periodStart,
      periodEnd,
      changeAt: new Date("2026-05-20T00:00:00Z"),
    });

    expect(proration).toEqual({ creditCents: -1000, chargeCents: 2000, netCents: 1000 });
  });
});
