import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const billingInterval = pgEnum("billing_interval", ["month", "year"]);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    interval: billingInterval("interval").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    trialDays: integer("trial_days").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("plans_price_non_negative", sql`${t.priceCents} >= 0`),
    check("plans_trial_days_non_negative", sql`${t.trialDays} >= 0`),
  ],
);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus("status").notNull(),
    billingAnchor: timestamptz("billing_anchor").notNull(),
    cycle: integer("cycle").notNull().default(0),
    currentPeriodStart: timestamptz("current_period_start").notNull(),
    currentPeriodEnd: timestamptz("current_period_end").notNull(),
    trialEnd: timestamptz("trial_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamptz("canceled_at"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (t) => [
    index("subscriptions_customer_idx").on(t.customerId),
    index("subscriptions_due_idx").on(t.status, t.currentPeriodEnd),
  ],
);
