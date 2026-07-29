-- Additive schema for BI/CRM (nullable — safe for existing tenants)
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "cost_cents" integer;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "supplier" varchar(255);

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "city" varchar(120);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "neighborhood" varchar(120);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "zip_code" varchar(20);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "state" varchar(80);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "country" varchar(80);
