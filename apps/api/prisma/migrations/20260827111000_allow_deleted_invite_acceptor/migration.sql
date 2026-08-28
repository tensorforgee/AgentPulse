ALTER TABLE "organization_invites"
DROP CONSTRAINT "organization_invites_acceptance_check";

ALTER TABLE "organization_invites"
ADD CONSTRAINT "organization_invites_acceptance_check"
CHECK (
    ("accepted_at" IS NULL AND "accepted_by_user_id" IS NULL)
    OR "accepted_at" IS NOT NULL
);
