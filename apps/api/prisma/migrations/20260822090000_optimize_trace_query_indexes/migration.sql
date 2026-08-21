DROP INDEX "traces_project_id_started_at_idx";
DROP INDEX "spans_trace_id_idx";

CREATE INDEX "traces_project_id_started_at_id_idx"
ON "traces"("project_id", "started_at" DESC, "id" DESC);

CREATE INDEX "traces_project_id_status_started_at_id_idx"
ON "traces"("project_id", "status", "started_at" DESC, "id" DESC);

CREATE INDEX "spans_trace_id_started_at_id_idx"
ON "spans"("trace_id", "started_at", "id");
