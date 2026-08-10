ALTER TABLE "order_items" ADD COLUMN "original_total" integer;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_reason" varchar(100);
