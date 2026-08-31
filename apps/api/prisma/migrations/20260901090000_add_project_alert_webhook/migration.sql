ALTER TABLE "projects"
ADD COLUMN "alert_webhook_url" TEXT,
ADD COLUMN "alert_webhook_secret_encrypted" TEXT;

ALTER TABLE "projects"
ADD CONSTRAINT "projects_alert_webhook_configuration_check"
CHECK (
  (
    "alert_webhook_url" IS NULL
    AND "alert_webhook_secret_encrypted" IS NULL
  )
  OR
  (
    btrim("alert_webhook_url") <> ''
    AND btrim("alert_webhook_secret_encrypted") <> ''
  )
);
