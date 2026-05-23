import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").unique(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: invoiceStatus("status").notNull().default("draft"),
    currency: text("currency").notNull(),
    periodStart: timestamptz("period_start").notNull(),
    periodEnd: timestamptz("period_end").notNull(),
    totalCents: integer("total_cents").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextPaymentAttemptAt: timestamptz("next_payment_attempt_at"),
    finalizedAt: timestamptz("finalized_at"),
    paidAt: timestamptz("paid_at"),
    voidedAt: timestamptz("voided_at"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("invoices_subscription_period_uq").on(t.subscriptionId, t.periodStart),
    index("invoices_retry_idx").on(t.status, t.nextPaymentAttemptAt),
    check("invoices_total_non_negative", sql`${t.totalCents} >= 0`),
  ],
);

export const invoiceLineKind = pgEnum("invoice_line_kind", ["subscription", "proration", "credit"]);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: invoiceLineKind("kind").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    periodStart: timestamptz("period_start").notNull(),
    periodEnd: timestamptz("period_end").notNull(),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const invoiceCounters = pgTable("invoice_counters", {
  year: integer("year").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const paymentAttemptStatus = pgEnum("payment_attempt_status", ["succeeded", "failed"]);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    status: paymentAttemptStatus("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    gatewayReference: text("gateway_reference"),
    failureReason: text("failure_reason"),
    attemptedAt: timestamptz("attempted_at").notNull(),
  },
  (t) => [index("payment_attempts_invoice_idx").on(t.invoiceId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    responseBody: text("response_body"),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);

export const pendingInvoiceItems = pgTable(
  "pending_invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    kind: invoiceLineKind("kind").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    periodStart: timestamptz("period_start").notNull(),
    periodEnd: timestamptz("period_end").notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [index("pending_invoice_items_subscription_idx").on(t.subscriptionId, t.invoiceId)],
);
