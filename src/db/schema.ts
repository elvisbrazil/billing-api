import { sql } from "drizzle-orm";
import { check, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
