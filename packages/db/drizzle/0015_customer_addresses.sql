CREATE TABLE IF NOT EXISTS "customer_addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "label" varchar(50),
  "address" text NOT NULL,
  "city" varchar(120),
  "neighborhood" varchar(120),
  "zip_code" varchar(20),
  "state" varchar(80),
  "country" varchar(80),
  "reference" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customer_addresses_customer"
  ON "customer_addresses" ("customer_id");
--> statement-breakpoint
-- Backfill primary address into address book (idempotent-ish: only when none exist)
INSERT INTO "customer_addresses" (
  "customer_id", "label", "address", "city", "neighborhood",
  "zip_code", "state", "country", "sort_order"
)
SELECT
  c."id",
  'Endereço 1',
  c."address",
  c."city",
  c."neighborhood",
  c."zip_code",
  c."state",
  c."country",
  0
FROM "customers" c
WHERE c."address" IS NOT NULL
  AND length(trim(c."address")) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "customer_addresses" a WHERE a."customer_id" = c."id"
  );
