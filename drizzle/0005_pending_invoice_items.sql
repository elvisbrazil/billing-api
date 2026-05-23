ALTER TYPE "public"."invoice_line_kind" ADD VALUE 'credit';--> statement-breakpoint
CREATE TABLE "pending_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "invoice_line_kind" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"invoice_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_invoice_items" ADD CONSTRAINT "pending_invoice_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_invoice_items" ADD CONSTRAINT "pending_invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_invoice_items_subscription_idx" ON "pending_invoice_items" USING btree ("subscription_id","invoice_id");