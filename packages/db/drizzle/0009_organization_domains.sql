CREATE TABLE IF NOT EXISTS "organization_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "hostname" varchar(255) NOT NULL UNIQUE,
  "is_primary" boolean NOT NULL DEFAULT false,
  "verified_at" timestamptz,
  "ssl_status" varchar(20) NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_domains_org_idx" ON "organization_domains" ("organization_id");
