ALTER TABLE "orders" ADD COLUMN "delivery_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_reference" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee" integer DEFAULT 0 NOT NULL;
