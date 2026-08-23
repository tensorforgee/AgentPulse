# AgentPulse Month 1 Database Design

> **Historical design reference:** this document records the original Month 1
> persistence plan. The implemented Prisma schema and migrations under
> [`apps/api/prisma/`](../apps/api/prisma/) are the source of truth. Later work
> added authentication refresh-token fields, alert rules, alert events, and
> query indexes that are not fully represented below. Do not use this document
> as migration instructions.

## Scope

This document defines the original PostgreSQL schema planned for the
AgentPulse Month 1 database foundation. It is a design specification only: it
does not create tables and is not a Prisma schema.

The Month 1 schema contains these seven core tables:

- `organizations`
- `users`
- `org_members`
- `projects`
- `api_keys`
- `traces`
- `spans`

For this milestone, a row in `traces` represents one complete agent execution
(called an Agent Run elsewhere in the architecture). A trace contains the
nested spans emitted during that execution. A separate `agent_runs` table is
not part of the Month 1 schema.

## Conventions

- Primary keys use `uuid` with the suggested default `gen_random_uuid()`.
- Timestamps use `timestamptz` and are stored in UTC.
- `created_at` defaults to `now()`.
- `updated_at` defaults to `now()`, but application code or a future database
  trigger must update it whenever a row changes; a column default alone does
  not do that.
- Unbounded user-supplied names and descriptions use `text`. Intentionally
  bounded lookup values may use `varchar(n)`.
- Flexible telemetry uses `jsonb`, with an empty JSON object as the default
  where appropriate.
- Status, role, and span-type values use `text` plus `CHECK` constraints for
  Month 1. PostgreSQL enums can be considered after the vocabulary stabilizes.
- Monetary values use `numeric(18, 8)` rather than floating-point types.
- Durations and token counts must be non-negative.
- Foreign-key columns use the same `uuid` type as the referenced primary key.

## Relationship Summary

```text
users ──< org_members >── organizations ──< projects ──< api_keys
                                                │
                                                └──< traces ──< spans
                                                                  │
                                                                  └── parent span (optional)
```

- One organization has many projects.
- Users and organizations have a many-to-many relationship through
  `org_members`.
- One project has many API keys.
- One project has many traces.
- One trace has many spans.
- A span may have one parent span in the same trace; a parent span may have
  many child spans.

## Table Specifications

### `organizations`

**Purpose:** Represents a company, team, or group that owns AgentPulse
projects.

| Field | PostgreSQL type | Nullability | Default | Constraints and notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Required | `gen_random_uuid()` | Primary key |
| `name` | `text` | Required | None | Human-readable organization name; must not be empty |
| `slug` | `varchar(100)` | Required | None | Unique, URL-safe organization identifier; store in lowercase |
| `plan` | `text` | Required | `'free'` | Month 1 plan identifier; validate against the product's plan catalog once paid plans are defined |
| `stripe_customer_id` | `text` | Nullable | `NULL` | Reserved Stripe customer identifier; nullable because Stripe integration is deferred |
| `created_at` | `timestamptz` | Required | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | Required | `now()` | Last-update timestamp; maintained on every update |

**Primary key:** `id`

**Foreign keys:** None.

**Unique constraints:** `UNIQUE (slug)`. No uniqueness requirement is assigned
to `stripe_customer_id` until the Stripe integration defines its lifecycle and
test/live-mode behavior.

**Relationships:** One organization has many `org_members` rows and many
`projects` rows.

### `users`

**Purpose:** Stores a human user who can belong to one or more organizations.

| Field | PostgreSQL type | Nullability | Default | Constraints and notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Required | `gen_random_uuid()` | Primary key |
| `email` | `varchar(320)` | Required | None | Unique login identity; trim and normalize to lowercase before storage |
| `password_hash` | `text` | Required | None | Output of the approved password-hashing algorithm; never a raw password |
| `display_name` | `text` | Nullable | `NULL` | Optional name shown in the UI |
| `created_at` | `timestamptz` | Required | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | Required | `now()` | Last-update timestamp; maintained on every update |

**Primary key:** `id`

**Foreign keys:** None.

**Unique constraints:** `UNIQUE (email)`. The application must store a
canonical lowercase email so uniqueness is case-insensitive in practice
without requiring a PostgreSQL extension.

**Relationships:** A user has many `org_members` rows and therefore belongs to
many organizations.

### `org_members`

**Purpose:** Join table for organization membership. It models the many-to-many
relationship between users and organizations and stores membership-specific
attributes.

| Field | PostgreSQL type | Nullability | Default | Constraints and notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Required | `gen_random_uuid()` | Primary key |
| `org_id` | `uuid` | Required | None | Foreign key to `organizations.id` |
| `user_id` | `uuid` | Required | None | Foreign key to `users.id` |
| `role` | `text` | Required | `'member'` | Suggested check: `role IN ('owner', 'admin', 'member', 'viewer')` |
| `created_at` | `timestamptz` | Required | `now()` | Time the membership was created |
| `updated_at` | `timestamptz` | Required | `now()` | Last-update timestamp; maintained on every update |

**Primary key:** `id`

**Foreign keys:**

- `org_id` references `organizations.id` with `ON DELETE CASCADE`.
- `user_id` references `users.id` with `ON DELETE CASCADE`.

**Unique constraints:** `UNIQUE (org_id, user_id)` prevents the same user from
being added to one organization more than once.

**Relationships:** Each row belongs to exactly one organization and one user.
Together, the rows implement User many-to-many Organization.

### `projects`

**Purpose:** Represents an AI-agent application or system whose telemetry is
collected by AgentPulse.

| Field | PostgreSQL type | Nullability | Default | Constraints and notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Required | `gen_random_uuid()` | Primary key |
| `org_id` | `uuid` | Required | None | Foreign key to `organizations.id` |
| `name` | `text` | Required | None | Human-readable project name; must not be empty |
| `slug` | `varchar(100)` | Required | None | URL-safe identifier, unique within its organization; store in lowercase |
| `description` | `text` | Nullable | `NULL` | Optional project description |
| `created_at` | `timestamptz` | Required | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | Required | `now()` | Last-update timestamp; maintained on every update |

**Primary key:** `id`

**Foreign keys:** `org_id` references `organizations.id` with
`ON DELETE CASCADE`.

**Unique constraints:** `UNIQUE (org_id, slug)`.

**Relationships:** Each project belongs to one organization and has many API
keys and traces.

### `api_keys`

**Purpose:** Stores project-scoped credentials used by AgentPulse SDKs to send
telemetry. The full raw key is returned only when it is created and is never
persisted.

| Field | PostgreSQL type | Nullability | Default | Constraints and notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Required | `gen_random_uuid()` | Primary key; not the credential itself |
| `project_id` | `uuid` | Required | None | Foreign key to `projects.id` |
| `name` | `text` | Required | None | Human-readable label such as `Production` |
| `prefix` | `varchar(16)` | Required | None | Non-secret leading characters used to identify a key in the UI and during lookup |
| `hashed_key` | `text` | Required | None | Unique hash of the complete raw API key; never store the raw API key |
| `last_used_at` | `timestamptz` | Nullable | `NULL` | Most recent successful authentication time |
| `expires_at` | `timestamptz` | Nullable | `NULL` | Optional expiration time; `NULL` means no scheduled expiry |
| `revoked_at` | `timestamptz` | Nullable | `NULL` | Revocation time; `NULL` means not revoked |
| `created_at` | `timestamptz` | Required | `now()` | Creation timestamp |

**Primary key:** `id`

**Foreign keys:** `project_id` references `projects.id` with
`ON DELETE CASCADE`.

**Unique constraints:** `UNIQUE (hashed_key)`. `prefix` is intentionally not
assumed to be globally unique because short display prefixes can collide.

**Relationships:** Each API key belongs to exactly one project; a project may
have multiple active, expired, or revoked keys.

### `traces`

**Purpose:** Represents one complete execution of an AI agent and stores its
run-level status and aggregate telemetry.

| Field | PostgreSQL type | Nullability | Default | Constraints and notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Required | `gen_random_uuid()` | Primary key; may be generated by the SDK for end-to-end correlation |
| `project_id` | `uuid` | Required | None | Foreign key to `projects.id` |
| `agent_name` | `text` | Required | None | Name of the executing agent |
| `name` | `text` | Nullable | `NULL` | Optional human-readable operation or run name |
| `status` | `text` | Required | `'running'` | Suggested check: `status IN ('running', 'success', 'failed')` |
| `started_at` | `timestamptz` | Required | None | Time execution began; supplied by the telemetry producer |
| `ended_at` | `timestamptz` | Nullable | `NULL` | Time execution ended; `NULL` while running or incomplete |
| `duration_ms` | `bigint` | Nullable | `NULL` | Non-negative elapsed milliseconds; nullable until completion |
| `input_tokens` | `bigint` | Required | `0` | Stored non-negative aggregate input-token count |
| `output_tokens` | `bigint` | Required | `0` | Stored non-negative aggregate output-token count |
| `total_tokens` | `bigint` | Required | `0` | Stored non-negative aggregate token count; must equal `input_tokens + output_tokens` |
| `total_cost` | `numeric(18, 8)` | Required | `0` | Stored non-negative aggregate of span-level estimated costs in the system's documented currency |
| `metadata` | `jsonb` | Required | `'{}'::jsonb` | Extensible run metadata; must be a JSON object |
| `error_type` | `text` | Nullable | `NULL` | Normalized failure category when applicable |
| `error_message` | `text` | Nullable | `NULL` | Sanitized failure message when applicable |
| `created_at` | `timestamptz` | Required | `now()` | Database receipt/creation timestamp |

**Primary key:** `id`

**Foreign keys:** `project_id` references `projects.id` with
`ON DELETE CASCADE`.

**Unique constraints:** No additional unique constraint is required because
the trace UUID is the cross-system correlation identifier.

**Relationships:** Each trace belongs to exactly one project and has many
spans.

`total_tokens` and `total_cost` are stored, denormalized trace aggregates so the
dashboard can query them without scanning all spans. Ingestion must update them
idempotently. `total_tokens` is derived logically from the stored input and
output counts, while `total_cost` is derived logically from the trace's
span-level `estimated_cost` values. The stored values remain the canonical
query fields and must be reconciled if spans are amended.

### `spans`

**Purpose:** Represents one timed operation within a trace, including agent
steps, LLM calls, tool calls, and custom operations. Parent-child links form a
trace tree.

| Field | PostgreSQL type | Nullability | Default | Constraints and notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Required | `gen_random_uuid()` | Primary key; may be generated by the SDK |
| `trace_id` | `uuid` | Required | None | Foreign key to `traces.id` |
| `parent_span_id` | `uuid` | Nullable | `NULL` | Optional self-reference; root spans have `NULL` |
| `name` | `text` | Required | None | Operation name, such as `Planning` or `web_search` |
| `span_type` | `text` | Required | `'custom'` | Suggested check: `span_type IN ('llm_call', 'tool_call', 'retrieval', 'agent', 'custom')` |
| `status` | `text` | Required | `'running'` | Suggested check: `status IN ('running', 'success', 'failed')` |
| `started_at` | `timestamptz` | Required | None | Time the operation began |
| `ended_at` | `timestamptz` | Nullable | `NULL` | Time the operation ended; `NULL` while running or incomplete |
| `latency_ms` | `bigint` | Nullable | `NULL` | Canonical non-negative span latency in milliseconds; nullable until completion |
| `input` | `jsonb` | Nullable | `NULL` | Optional sanitized/redacted operation input |
| `output` | `jsonb` | Nullable | `NULL` | Optional sanitized/redacted operation output |
| `provider` | `text` | Nullable | `NULL` | LLM provider when this is an LLM span |
| `model` | `text` | Nullable | `NULL` | Model identifier when this is an LLM span |
| `input_tokens` | `bigint` | Required | `0` | Non-negative input-token count for this span |
| `output_tokens` | `bigint` | Required | `0` | Non-negative output-token count for this span |
| `estimated_cost` | `numeric(18, 8)` | Required | `0` | Non-negative estimated cost for this span |
| `attributes` | `jsonb` | Required | `'{}'::jsonb` | Extensible operation metadata; must be a JSON object |
| `error_type` | `text` | Nullable | `NULL` | Normalized failure category when applicable |
| `error_message` | `text` | Nullable | `NULL` | Sanitized failure message when applicable |
| `error_stack` | `text` | Nullable | `NULL` | Sanitized stack trace when available |
| `created_at` | `timestamptz` | Required | `now()` | Database receipt/creation timestamp |

**Primary key:** `id`

**Foreign keys:**

- `trace_id` references `traces.id` with `ON DELETE CASCADE`.
- The composite foreign key `(trace_id, parent_span_id)` references
  `spans(trace_id, id)`. `parent_span_id` is nullable, so root spans do not
  require a parent. This composite reference ensures a parent belongs to the
  same trace as its child. If an individual parent span is deleted, only
  `parent_span_id` should be set to `NULL`; deleting a trace cascades to all its
  spans.

**Unique constraints:** `UNIQUE (trace_id, id)` is required as the referenced
key for the same-trace composite self-reference. The primary key still provides
global uniqueness for `id`.

**Relationships:** Each span belongs to exactly one trace. A span optionally
belongs to one parent span in that same trace and may have many child spans.

The canonical operation categories are `llm_call`, `tool_call`, and
`retrieval`. `agent` remains useful for higher-level orchestration steps, and
`custom` provides a forward-compatible category for operations that do not fit
the canonical types. `latency_ms` is the canonical span latency field and is
equivalent to the elapsed duration between `started_at` and `ended_at`; it is
named explicitly to match the source-of-truth observability vocabulary.

Application validation should also reject `parent_span_id = id`, because a
foreign key alone cannot prevent a span from being its own parent. Detection of
longer parent cycles should occur during ingestion or trace validation.

## Initial Index Strategy

PostgreSQL automatically creates B-tree indexes for primary-key and unique
constraints. The initial strategy below names both constraint-backed indexes
and additional indexes so their purpose is explicit.

| Table | Index or constraint | Purpose |
| --- | --- | --- |
| `users` | `UNIQUE (email)` | Enforces and accelerates lookup by normalized email |
| `organizations` | `UNIQUE (slug)` | Enforces and accelerates organization lookup by slug |
| `org_members` | `UNIQUE (org_id, user_id)` | Enforces one membership per user per organization and supports membership lookup |
| `org_members` | `INDEX (user_id)` | Supports listing all organizations for a user; the composite unique index already supports organization-first lookups |
| `projects` | `INDEX (org_id)` | Supports listing projects for an organization |
| `projects` | `UNIQUE (org_id, slug)` | Enforces project-slug uniqueness within an organization |
| `api_keys` | `INDEX (project_id)` | Supports listing and managing keys for a project |
| `api_keys` | `UNIQUE (hashed_key)` | Prevents duplicate stored key hashes and supports authentication lookup |
| `api_keys` | `INDEX (prefix)` | Narrows API-key lookup candidates without treating the prefix as secret or unique |
| `traces` | `INDEX (project_id, started_at DESC)` | Supports the primary dashboard query: recent traces for a project |
| `spans` | `INDEX (trace_id)` | Supports loading all spans for a trace |
| `spans` | `INDEX (parent_span_id)` | Supports child-span lookup and self-referential foreign-key operations |
| `spans` | `UNIQUE (trace_id, id)` | Supports the same-trace parent foreign key; it can also satisfy many trace-first lookups |

Before implementing both `INDEX (trace_id)` and `UNIQUE (trace_id, id)`, inspect
the expected query plans. Because both begin with `trace_id`, the dedicated
single-column index may be redundant at Month 1 scale. The logical requirement
is efficient `trace_id` lookup; avoid retaining duplicate indexes without a
measured reason.

## Security and Sensitive Data

- Never store raw passwords. Store only `users.password_hash`, generated with
  an approved password-hashing algorithm and per-password salt managed by that
  algorithm.
- Never log or store raw API keys. Store only `api_keys.hashed_key` plus the
  non-secret `api_keys.prefix`. Show the complete raw key once at creation.
- API-key comparison must use a timing-safe verification approach appropriate
  to the selected keyed-hash or password-hash design.
- Treat telemetry as potentially sensitive. Sanitize error messages, stack
  traces, and JSON metadata before persistence; apply payload-size limits.
- Do not place passwords, API keys, connection strings, or real customer
  telemetry in schema documentation, seed examples, or source control.
- Authorization must verify organization membership and project ownership; an
  identifier alone does not grant access.

## Integrity Rules for Implementation

When this design is later implemented, add database `CHECK` constraints for:

- non-empty required names and slugs;
- canonical lowercase organization and project slugs;
- allowed membership roles, trace statuses, span statuses, and span types;
- trace `duration_ms >= 0` and span `latency_ms >= 0` when present;
- token counts, `total_cost`, and span `estimated_cost` greater than or equal to
  zero;
- `total_tokens = input_tokens + output_tokens` on traces;
- `ended_at >= started_at` when `ended_at` is present;
- `parent_span_id IS NULL OR parent_span_id <> id`;
- `metadata` and `attributes` being JSON objects.

Ingestion should be idempotent by using producer-generated trace and span UUIDs.
Retries with an existing identifier should update or safely reject the same
logical telemetry record rather than create duplicates.

## Design Notes and Deferred Decisions

- The architecture uses both “Agent Run” and “Trace.” Month 1 uses one `traces`
  row per agent execution. If later requirements need multiple traces per run,
  introduce `agent_runs` only through an explicit architecture revision.
- Deleting an organization or project is modeled as cascading through its
  dependent Month 1 data. Production deletion should normally be a controlled
  operation with retention/export safeguards rather than an ordinary UI action.
- Email normalization is an application requirement in Month 1. If mixed-case
  storage becomes necessary, consider a unique index on `lower(email)` or the
  `citext` extension during implementation.
- The cost currency and model-pricing snapshot need explicit definitions before
  cost analytics are considered authoritative.
- Nullable span `input` and `output` JSONB fields preserve the original
  telemetry model, but they must contain only data allowed by the redaction,
  encryption, retention, and access policy. They should remain `NULL` when
  payload capture is disabled or unsafe.
- The organization `plan` and `stripe_customer_id` fields reserve the original
  product-plan concepts only. Stripe integration and billing behavior, along
  with Redis, BullMQ, alerts, and advanced multi-tenancy behavior, remain
  outside this Month 1 database-foundation scope.
