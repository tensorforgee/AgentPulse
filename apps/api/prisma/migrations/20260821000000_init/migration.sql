-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_canonical_check" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
    CONSTRAINT "users_password_hash_nonempty_check" CHECK (btrim("password_hash") <> '')
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "stripe_customer_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organizations_name_nonempty_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "organizations_slug_canonical_check" CHECK ("slug" = lower(btrim("slug")) AND "slug" <> ''),
    CONSTRAINT "organizations_plan_nonempty_check" CHECK (btrim("plan") <> '')
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_members_role_check" CHECK ("role" IN ('owner', 'admin', 'member', 'viewer'))
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_name_nonempty_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "projects_slug_canonical_check" CHECK ("slug" = lower(btrim("slug")) AND "slug" <> '')
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "hashed_key" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_keys_name_nonempty_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "api_keys_prefix_nonempty_check" CHECK (btrim("prefix") <> ''),
    CONSTRAINT "api_keys_hashed_key_nonempty_check" CHECK (btrim("hashed_key") <> '')
);

-- CreateTable
CREATE TABLE "traces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "agent_name" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "duration_ms" BIGINT,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "error_type" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "traces_agent_name_nonempty_check" CHECK (btrim("agent_name") <> ''),
    CONSTRAINT "traces_status_check" CHECK ("status" IN ('running', 'success', 'failed')),
    CONSTRAINT "traces_duration_nonnegative_check" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
    CONSTRAINT "traces_tokens_nonnegative_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND "total_tokens" >= 0),
    CONSTRAINT "traces_total_tokens_check" CHECK ("total_tokens" = "input_tokens" + "output_tokens"),
    CONSTRAINT "traces_total_cost_nonnegative_check" CHECK ("total_cost" >= 0),
    CONSTRAINT "traces_time_order_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
    CONSTRAINT "traces_metadata_object_check" CHECK (jsonb_typeof("metadata") = 'object')
);

-- CreateTable
CREATE TABLE "spans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trace_id" UUID NOT NULL,
    "parent_span_id" UUID,
    "name" TEXT NOT NULL,
    "span_type" TEXT NOT NULL DEFAULT 'custom',
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "latency_ms" BIGINT,
    "input" JSONB,
    "output" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "estimated_cost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "error_type" TEXT,
    "error_message" TEXT,
    "error_stack" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "spans_name_nonempty_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "spans_type_check" CHECK ("span_type" IN ('llm_call', 'tool_call', 'retrieval', 'agent', 'custom')),
    CONSTRAINT "spans_status_check" CHECK ("status" IN ('running', 'success', 'failed')),
    CONSTRAINT "spans_latency_nonnegative_check" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0),
    CONSTRAINT "spans_tokens_nonnegative_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0),
    CONSTRAINT "spans_cost_nonnegative_check" CHECK ("estimated_cost" >= 0),
    CONSTRAINT "spans_time_order_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
    CONSTRAINT "spans_parent_not_self_check" CHECK ("parent_span_id" IS NULL OR "parent_span_id" <> "id"),
    CONSTRAINT "spans_attributes_object_check" CHECK (jsonb_typeof("attributes") = 'object')
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "org_members_user_id_idx" ON "org_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_org_id_user_id_key" ON "org_members"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "projects_org_id_idx" ON "projects"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_id_slug_key" ON "projects"("org_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashed_key_key" ON "api_keys"("hashed_key");

-- CreateIndex
CREATE INDEX "api_keys_project_id_idx" ON "api_keys"("project_id");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "traces_project_id_started_at_idx" ON "traces"("project_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "spans_trace_id_idx" ON "spans"("trace_id");

-- CreateIndex
CREATE INDEX "spans_parent_span_id_idx" ON "spans"("parent_span_id");

-- CreateIndex
CREATE UNIQUE INDEX "spans_trace_id_id_key" ON "spans"("trace_id", "id");

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spans" ADD CONSTRAINT "spans_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- PostgreSQL 18 can null only parent_span_id, preserving the required trace_id
-- while enforcing that parent and child spans belong to the same trace.
ALTER TABLE "spans" ADD CONSTRAINT "spans_trace_id_parent_span_id_fkey" FOREIGN KEY ("trace_id", "parent_span_id") REFERENCES "spans"("trace_id", "id") ON DELETE SET NULL ("parent_span_id") ON UPDATE CASCADE;
