-- CreateTable
CREATE TABLE "alert_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "alert_rule_id" UUID,
    "trace_id" UUID NOT NULL,
    "rule_name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "threshold" DECIMAL(18,8) NOT NULL,
    "observed_value" DECIMAL(18,8) NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "window_ended_at" TIMESTAMPTZ(6) NOT NULL,
    "delivery_status" TEXT NOT NULL DEFAULT 'pending',
    "delivery_attempted_at" TIMESTAMPTZ(6),
    "delivery_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alert_events_rule_type_check" CHECK ("rule_type" IN ('error_rate', 'latency', 'cost')),
    CONSTRAINT "alert_events_threshold_check" CHECK ("threshold" > 0),
    CONSTRAINT "alert_events_observed_value_check" CHECK ("observed_value" >= 0),
    CONSTRAINT "alert_events_window_check" CHECK ("window_started_at" <= "window_ended_at"),
    CONSTRAINT "alert_events_delivery_status_check" CHECK ("delivery_status" IN ('pending', 'not_configured', 'delivered', 'failed'))
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_events_alert_rule_id_trace_id_key" ON "alert_events"("alert_rule_id", "trace_id");

-- CreateIndex
CREATE INDEX "alert_events_project_id_created_at_idx" ON "alert_events"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "alert_events_trace_id_idx" ON "alert_events"("trace_id");

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_rule_id_fkey"
FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_trace_id_fkey"
FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
