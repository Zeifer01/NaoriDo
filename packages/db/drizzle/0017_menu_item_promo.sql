ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "promo_quantity" integer;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "promo_price_cents" integer;
