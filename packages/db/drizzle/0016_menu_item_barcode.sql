ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "barcode" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_menu_items_org_barcode" ON "menu_items" ("organization_id", "barcode");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_menu_items_org_barcode"
  ON "menu_items" ("organization_id", "barcode")
  WHERE "barcode" IS NOT NULL;
