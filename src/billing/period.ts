export type BillingInterval = "month" | "year";

const DAY_MS = 86_400_000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addMonthsClamped(date: Date, months: number): Date {
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12;
  const day = Math.min(date.getUTCDate(), daysInMonth(year, month));

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export interface Period {
  start: Date;
  end: Date;
}

export function billingPeriod(anchor: Date, interval: BillingInterval, cycle: number): Period {
  const months = interval === "month" ? 1 : 12;
  return {
    start: addMonthsClamped(anchor, cycle * months),
    end: addMonthsClamped(anchor, (cycle + 1) * months),
  };
}
