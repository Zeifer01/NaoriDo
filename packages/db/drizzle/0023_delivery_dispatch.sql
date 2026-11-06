ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'driver';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"cash_collected" integer DEFAULT 0 NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"tip_method" varchar(20),
	CONSTRAINT "delivery_assignments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_assignments_branch_driver" ON "delivery_assignments" USING btree ("branch_id","driver_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_assignments_delivered" ON "delivery_assignments" USING btree ("branch_id","delivered_at");
