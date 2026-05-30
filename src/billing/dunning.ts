import { addDays } from "./period.js";

export const RETRY_SCHEDULE_DAYS = [1, 3, 7] as const;

export function nextRetryAt(firstFailureAt: Date, failedAttempts: number): Date | null {
  const offset = RETRY_SCHEDULE_DAYS[failedAttempts - 1];
  return offset === undefined ? null : addDays(firstFailureAt, offset);
}
