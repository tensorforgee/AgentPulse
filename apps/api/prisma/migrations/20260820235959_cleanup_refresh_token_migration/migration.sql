-- Remove only the fresh-install placeholder created by the compatibility
-- bootstrap. The email-column guard prevents an actual users table from being
-- dropped if a similarly named marker is ever present unexpectedly.
DO $$
BEGIN
    IF to_regclass('public._agentpulse_refresh_token_bootstrap') IS NOT NULL THEN
        IF to_regclass('public.users') IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'users'
                    AND column_name = 'email'
            ) THEN
            DROP TABLE "public"."users";
        END IF;

        DROP TABLE "public"."_agentpulse_refresh_token_bootstrap";
    END IF;
END
$$;
