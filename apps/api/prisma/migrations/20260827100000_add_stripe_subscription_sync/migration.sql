-- Stripe subscription lifecycle fields are nullable because free organizations
-- have no external billing period. No payment method or card data is stored.
ALTER TABLE "organizations"
    ADD COLUMN "billing_period_started_at" TIMESTAMPTZ(6),
    ADD COLUMN "billing_period_ends_at" TIMESTAMPTZ(6),
    ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "organizations_billing_period_order_check"
        CHECK (
            ("billing_period_started_at" IS NULL AND "billing_period_ends_at" IS NULL)
            OR (
                "billing_period_started_at" IS NOT NULL
                AND "billing_period_ends_at" IS NOT NULL
                AND "billing_period_ends_at" > "billing_period_started_at"
            )
        );

-- Store only provider event identifiers needed for idempotency, never webhook
-- payloads or payment data.
CREATE TABLE "billing_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "org_id" UUID,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_webhook_events_provider_check"
        CHECK (
            "provider" = lower(btrim("provider"))
            AND "provider" <> ''
        ),
    CONSTRAINT "billing_webhook_events_external_id_nonempty_check"
        CHECK (btrim("external_event_id") <> ''),
    CONSTRAINT "billing_webhook_events_type_nonempty_check"
        CHECK (btrim("event_type") <> '')
);

CREATE UNIQUE INDEX "billing_webhook_events_provider_external_id_key"
ON "billing_webhook_events"("provider", "external_event_id");

CREATE INDEX "billing_webhook_events_org_id_processed_at_idx"
ON "billing_webhook_events"("org_id", "processed_at");

ALTER TABLE "billing_webhook_events"
ADD CONSTRAINT "billing_webhook_events_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
