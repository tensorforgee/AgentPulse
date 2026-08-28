CREATE TABLE "organization_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token_digest" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "accepted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_invites_email_canonical_check"
        CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
    CONSTRAINT "organization_invites_role_check"
        CHECK ("role" IN ('admin', 'member', 'viewer')),
    CONSTRAINT "organization_invites_token_digest_check"
        CHECK ("token_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "organization_invites_expiry_check"
        CHECK ("expires_at" > "created_at"),
    CONSTRAINT "organization_invites_acceptance_check"
        CHECK (
            ("accepted_at" IS NULL AND "accepted_by_user_id" IS NULL)
            OR ("accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL)
        )
);

CREATE UNIQUE INDEX "organization_invites_token_digest_key"
ON "organization_invites"("token_digest");

CREATE UNIQUE INDEX "organization_invites_org_id_email_key"
ON "organization_invites"("org_id", "email");

CREATE INDEX "organization_invites_org_id_expires_at_idx"
ON "organization_invites"("org_id", "expires_at");

ALTER TABLE "organization_invites"
ADD CONSTRAINT "organization_invites_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_invites"
ADD CONSTRAINT "organization_invites_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_invites"
ADD CONSTRAINT "organization_invites_accepted_by_user_id_fkey"
FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
