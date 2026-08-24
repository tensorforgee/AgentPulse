-- Preserve the historical refresh-token migration while allowing it to run
-- before the initial schema on a completely fresh database. Existing databases
-- already have users, so this compatibility bootstrap is a no-op for them.
DO $$
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        CREATE TABLE "public"."_agentpulse_refresh_token_bootstrap" (
            "id" BOOLEAN NOT NULL DEFAULT true
        );
        CREATE TABLE "public"."users" (
            "id" UUID
        );
    END IF;
END
$$;
