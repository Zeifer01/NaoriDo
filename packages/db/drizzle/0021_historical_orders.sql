CREATE TABLE "historical_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"address" text,
	"fulfillment" varchar(20) DEFAULT 'unknown' NOT NULL,
	"items_text" text,
	"total" integer NOT NULL,
	"payment_method" varchar(20),
	"order_date" timestamp with time zone NOT NULL,
	"source" varchar(40) DEFAULT 'whatsapp_import' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historical_orders" ADD CONSTRAINT "historical_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_orders" ADD CONSTRAINT "historical_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_historical_orders_branch_date" ON "historical_orders" USING btree ("branch_id","order_date");--> statement-breakpoint
CREATE INDEX "idx_historical_orders_org_date" ON "historical_orders" USING btree ("organization_id","order_date");