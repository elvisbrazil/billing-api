import { conflict } from "../../errors.js";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

const allowed: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  trialing: ["active", "past_due", "canceled"],
  active: ["past_due", "canceled"],
  past_due: ["active", "canceled"],
  canceled: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return allowed[from].includes(to);
}

export function assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!canTransition(from, to)) {
    throw conflict(`Subscription cannot go from ${from} to ${to}`, { from, to });
  }
}
