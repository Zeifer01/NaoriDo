CREATE TABLE "order_deletion_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_number" varchar(20) NOT NULL,
	"order_total" integer NOT NULL,
	"order_status" varchar(20) NOT NULL,
	"customer_name" varchar(255),
	"order_created_at" timestamp with time zone NOT NULL,
	"order_snapshot" jsonb NOT NULL,
	"deleted_by" uuid,
	"deleted_by_name" varchar(255) NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_deletion_log" ADD CONSTRAINT "order_deletion_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_deletion_log" ADD CONSTRAINT "order_deletion_log_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_deletion_log" ADD CONSTRAINT "order_deletion_log_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_order_deletion_log_org" ON "order_deletion_log" USING btree ("organization_id","deleted_at");
--> statement-breakpoint
CREATE INDEX "idx_order_deletion_log_branch" ON "order_deletion_log" USING btree ("branch_id","deleted_at");
