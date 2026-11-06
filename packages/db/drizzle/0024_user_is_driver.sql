ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_driver" boolean DEFAULT false NOT NULL;
