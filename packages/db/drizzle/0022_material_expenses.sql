CREATE TABLE "material_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"category" varchar(60) NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount" integer NOT NULL,
	"vendor" varchar(255),
	"notes" text,
	"receipt_url" varchar(500),
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_expenses" ADD CONSTRAINT "material_expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_expenses" ADD CONSTRAINT "material_expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_expenses" ADD CONSTRAINT "material_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_material_expenses_branch_date" ON "material_expenses" USING btree ("branch_id","expense_date");--> statement-breakpoint
CREATE INDEX "idx_material_expenses_org_date" ON "material_expenses" USING btree ("organization_id","expense_date");