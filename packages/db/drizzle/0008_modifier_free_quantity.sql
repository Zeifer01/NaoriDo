-- free_quantity on modifier groups (3 free toppings pattern for açaí etc.)
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "free_quantity" integer NOT NULL DEFAULT 0;
