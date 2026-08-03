ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_fee_status" varchar(20) DEFAULT 'confirmed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_city" varchar(120);
