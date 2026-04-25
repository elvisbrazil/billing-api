import { describe, expect, it } from "vitest";
import { addMonthsClamped, billingPeriod } from "../src/billing/period.js";

const utc = (iso: string) => new Date(`${iso}Z`);

describe("addMonthsClamped", () => {
  it("clamps Jan 31 to the last day of February", () => {
    expect(addMonthsClamped(utc("2026-01-31T10:00:00"), 1)).toEqual(utc("2026-02-28T10:00:00"));
  });

  it("lands on Feb 29 in leap years", () => {
    expect(addMonthsClamped(utc("2028-01-31T10:00:00"), 1)).toEqual(utc("2028-02-29T10:00:00"));
  });

  it("rolls over the year", () => {
    expect(addMonthsClamped(utc("2026-12-15T00:00:00"), 1)).toEqual(utc("2027-01-15T00:00:00"));
  });

  it("keeps the time of day", () => {
    expect(addMonthsClamped(utc("2026-04-30T23:59:59.999"), 2)).toEqual(
      utc("2026-06-30T23:59:59.999"),
    );
  });
});

describe("billingPeriod", () => {
  const anchor = utc("2026-01-31T12:00:00");

  it("computes consecutive monthly periods from the anchor", () => {
    expect(billingPeriod(anchor, "month", 0)).toEqual({
      start: utc("2026-01-31T12:00:00"),
      end: utc("2026-02-28T12:00:00"),
    });
    expect(billingPeriod(anchor, "month", 1)).toEqual({
      start: utc("2026-02-28T12:00:00"),
      end: utc("2026-03-31T12:00:00"),
    });
  });

  it("does not drift after a short month", () => {
    expect(billingPeriod(anchor, "month", 3).end).toEqual(utc("2026-05-31T12:00:00"));
  });

  it("produces contiguous periods over several years", () => {
    for (let cycle = 0; cycle < 60; cycle++) {
      expect(billingPeriod(anchor, "month", cycle).end).toEqual(
        billingPeriod(anchor, "month", cycle + 1).start,
      );
    }
  });

  it("handles a yearly plan anchored on Feb 29", () => {
    const leap = utc("2028-02-29T08:00:00");
    expect(billingPeriod(leap, "year", 0).end).toEqual(utc("2029-02-28T08:00:00"));
    expect(billingPeriod(leap, "year", 3).end).toEqual(utc("2032-02-29T08:00:00"));
  });
});
