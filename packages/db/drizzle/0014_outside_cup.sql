ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "allow_outside_cup" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "outside_cup_fee_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ADD COLUMN IF NOT EXISTS "is_outside_cup" boolean DEFAULT false NOT NULL;
