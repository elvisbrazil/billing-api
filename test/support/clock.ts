import { addDays } from "../../src/billing/period.js";
import type { Clock } from "../../src/clock.js";

export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date | string = "2026-05-04T12:00:00Z") {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date | string) {
    this.current = new Date(date);
  }

  advanceDays(days: number) {
    this.current = addDays(this.current, days);
  }
}
