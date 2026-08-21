-- CreateTable
CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "threshold" DECIMAL(18,8) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alert_rules_name_nonempty_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "alert_rules_type_check" CHECK ("type" IN ('error_rate', 'latency', 'cost')),
    CONSTRAINT "alert_rules_threshold_check" CHECK (
        "threshold" > 0
        AND ("type" <> 'error_rate' OR "threshold" <= 1)
        AND ("type" <> 'latency' OR "threshold" = trunc("threshold"))
    )
);

-- CreateIndex
CREATE INDEX "alert_rules_project_id_idx" ON "alert_rules"("project_id");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
