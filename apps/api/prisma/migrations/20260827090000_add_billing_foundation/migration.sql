-- CreateEnum
CREATE TYPE "billing_plan" AS ENUM ('free', 'pro');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM (
    'none',
    'trialing',
    'active',
    'past_due',
    'canceled'
);

-- Normalize the previously unconstrained placeholder before converting it to
-- the V1 plan enum. No paid billing behavior existed before this migration, so
-- unknown legacy values safely retain the existing free-plan behavior.
ALTER TABLE "organizations"
    DROP CONSTRAINT "organizations_plan_nonempty_check";

ALTER TABLE "organizations"
    ALTER COLUMN "plan" DROP DEFAULT,
    ALTER COLUMN "plan" TYPE "billing_plan"
        USING (
            CASE lower(btrim("plan"))
                WHEN 'pro' THEN 'pro'::"billing_plan"
                ELSE 'free'::"billing_plan"
            END
        ),
    ALTER COLUMN "plan" SET DEFAULT 'free';

-- Preserve any legacy customer identifiers while making the schema provider
-- neutral. This records their existing origin without adding provider logic.
ALTER TABLE "organizations"
    RENAME COLUMN "stripe_customer_id" TO "external_billing_customer_id";

UPDATE "organizations"
SET "external_billing_customer_id" = NULL
WHERE "external_billing_customer_id" IS NOT NULL
    AND btrim("external_billing_customer_id") = '';

ALTER TABLE "organizations"
    ADD COLUMN "subscription_status" "subscription_status" NOT NULL DEFAULT 'none',
    ADD COLUMN "billing_provider" TEXT,
    ADD COLUMN "external_billing_subscription_id" TEXT;

UPDATE "organizations"
SET "billing_provider" = 'stripe'
WHERE "external_billing_customer_id" IS NOT NULL;

ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_billing_provider_canonical_check"
        CHECK (
            "billing_provider" IS NULL
            OR (
                "billing_provider" = lower(btrim("billing_provider"))
                AND "billing_provider" <> ''
            )
        ),
    ADD CONSTRAINT "organizations_external_billing_customer_id_nonempty_check"
        CHECK (
            "external_billing_customer_id" IS NULL
            OR btrim("external_billing_customer_id") <> ''
        ),
    ADD CONSTRAINT "organizations_external_billing_subscription_id_nonempty_check"
        CHECK (
            "external_billing_subscription_id" IS NULL
            OR btrim("external_billing_subscription_id") <> ''
        ),
    ADD CONSTRAINT "organizations_external_billing_ids_provider_check"
        CHECK (
            "billing_provider" IS NOT NULL
            OR (
                "external_billing_customer_id" IS NULL
                AND "external_billing_subscription_id" IS NULL
            )
        );

-- External identifiers are unique within their provider namespace.
CREATE UNIQUE INDEX "organizations_billing_provider_customer_id_key"
ON "organizations"("billing_provider", "external_billing_customer_id");

CREATE UNIQUE INDEX "organizations_billing_provider_subscription_id_key"
ON "organizations"("billing_provider", "external_billing_subscription_id");
