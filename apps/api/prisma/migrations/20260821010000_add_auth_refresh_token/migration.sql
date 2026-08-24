-- Ensure the column exists after the initial schema migration. This is a no-op
-- for databases that already applied the historical refresh-token migration.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "refresh_token_hash" TEXT;
