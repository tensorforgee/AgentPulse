# AgentPulse Architecture

AgentPulse is an AI Agent Observability and Reliability platform.

Its purpose is to help developers monitor, debug, and understand AI-agent executions by collecting and visualizing telemetry such as agent runs, execution traces, LLM calls, tool calls, execution steps, latency, token usage, cost, errors, and failures.

The platform should help developers answer:
- What happened during an agent run?
- Which steps were executed?
- Which LLM or tool was called?
- Where did the execution fail?
- How long did each step take?
- How many tokens were used?
- How much did the execution cost?
- What is the likely root cause of a failure?

## Target High-Level Architecture

AI Agent
    ↓
AgentPulse SDK
    ↓
Ingestion API (NestJS)
    ↓
Redis / BullMQ
    ↓
Background Worker
    ↓
PostgreSQL
    ↓
NestJS API
    ↓
Next.js Dashboard

Redis, BullMQ, and the background worker are part of the target architecture,
but they are deferred from the initial Month 1 database implementation. The
Month 1 persistence path writes validated telemetry to PostgreSQL without
requiring the queue layer.

## Repository Architecture

AgentPulse/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # NestJS backend
├── docs/
│   └── architecture.md
├── AGENTS.md
├── README.md
└── .gitignore

## Core Concepts

### Organization

An organization represents a company, team, or group using AgentPulse. An organization can contain multiple projects.

Organization
    ├── Project A
    ├── Project B
    └── Project C

Organization-level multi-tenancy will be implemented after the core MVP.

### Project

A project represents an application or AI-agent system being monitored. Each project will eventually have its own API credentials for sending telemetry.

### Agent Run / Trace

An Agent Run represents one complete execution of an AI agent. In the
canonical Month 1 database model, one row in `traces` represents that complete
Agent Run. There is no separate `agent_runs` table.

Example:

User Request
    ↓
Agent Run
    ├── LLM Call
    ├── Tool Call
    ├── LLM Call
    └── Final Response

An Agent Run/trace should contain:
- trace ID
- project ID
- agent name
- start time
- end time
- status
- total duration
- total tokens
- estimated cost
- error information when applicable

Possible statuses:
- running
- success
- failed

## Traces and Spans

An agent execution can contain multiple nested operations. AgentPulse stores
the complete execution in `traces` and represents its operations as typed rows
in `spans`. LLM calls, tool calls, and retrievals use the canonical span types
`llm_call`, `tool_call`, and `retrieval`.

Example:

Agent Run
├── Planning
│   └── LLM Call
├── Search
│   └── Tool Call
└── Final Response
    └── LLM Call

Each span should contain:
- span ID
- parent span ID
- trace ID
- operation name
- type
- start time
- end time
- duration
- status
- metadata
- error information

The parentSpanId allows nested operations to form a trace tree.

Failures are recorded through trace/span status and error fields rather than a
separate Month 1 error table. Provider, model, token, cost, input/output, and
other operation-specific telemetry may be stored on the typed span fields
defined by the database schema.

## LLM Calls

An LLM call represents a request made by an agent to an LLM provider. In Month
1 persistence it is a span with `span_type = 'llm_call'`, not a separate table.

The system should be able to record:
- provider
- model
- input token count
- output token count
- total token count
- latency
- estimated cost
- request metadata
- response metadata

Raw prompts and responses may contain sensitive information and must be handled carefully.

## Tool Calls

A tool call represents an external tool or function executed by an agent. In
Month 1 persistence it is a span with `span_type = 'tool_call'`, not a separate
table. Retrieval operations use `span_type = 'retrieval'`.

Examples:
- web_search
- database_query
- calculator
- weather_api
- custom_function

A tool call should record:
- tool name
- input
- output metadata
- start time
- end time
- duration
- status
- error information

Sensitive tool input and output should not be stored without appropriate handling.

## Errors

AgentPulse should capture errors occurring during an agent execution. An error should be associated with the relevant run and span.

Example:

Agent Run
├── LLM Call       ✓
├── Search Tool    ❌
│   └── TimeoutError
└── Agent Failed

Error information should include:
- error type
- error message
- stack trace when available
- timestamp
- associated run
- associated span

## Telemetry Ingestion

The AgentPulse SDK will send telemetry to the backend.

Initial Month 1 flow:

Agent
  ↓
AgentPulse SDK
  ↓
POST /v1/ingest
  ↓
NestJS
  ↓
PostgreSQL

The ingestion endpoint should accept structured telemetry and validate incoming data before processing it.

The Month 1 implementation should keep synchronous processing minimal. A queue
and background worker may be introduced later when ingestion volume or
processing requirements justify them.

## Authentication and API Keys

Each project will eventually have an API key.

Project
    ↓
API Key
    ↓
AgentPulse SDK
    ↓
Telemetry Ingestion

API keys must:
- never be hardcoded in source code
- never be committed to Git
- never be exposed unnecessarily
- be stored securely

## PostgreSQL

PostgreSQL will be the primary persistent database.

The canonical Month 1 persistence model contains exactly these core tables:

- `organizations`
- `users`
- `org_members`
- `projects`
- `api_keys`
- `traces`
- `spans`

One `traces` row represents one complete Agent Run/execution. LLM calls, tool
calls, retrievals, and failures are represented through typed spans and
trace/span fields; they do not require separate Month 1 tables.

[`database-schema.md`](./database-schema.md) is the source of truth for Month 1
PostgreSQL persistence, including fields, constraints, relationships, and
indexes.

## Redis and BullMQ

Redis and BullMQ are deferred from the initial Month 1 database implementation.
They may later be used for asynchronous telemetry processing when the direct
ingestion path has been proven and operational requirements justify a queue.

Example:

POST /v1/ingest
       ↓
   Validate
       ↓
 Add Queue Job
       ↓
    Return
       ↓
    Worker
       ↓
 PostgreSQL

This allows telemetry ingestion to remain fast while processing happens asynchronously.

## Dashboard

The Next.js dashboard will provide visibility into agent executions.

Initial dashboard areas:
- Projects
- Agent Runs
- Run Details
- Traces
- Errors
- Performance
- Cost / Token Usage

The most important MVP screen is the Run Details page.

Example:

Agent Run #1842

Status: FAILED
Duration: 4.82s
Tokens: 2,431
Estimated Cost: $0.04

Trace
────────────────────────────────

Planning             820ms       ✓
   └── LLM Call      820ms       ✓

Search               2.81s       ❌
   └── Web Search    2.81s       ❌ TIMEOUT

Final Response       --          ❌

## AI Root-Cause Analysis

After the core observability system works, AgentPulse will use an LLM to analyze failed executions.

Example:

Run failed.

Likely root cause:
The web-search tool exceeded its configured timeout.

Evidence:
- Search operation lasted 2.81 seconds.
- The configured timeout was 2 seconds.
- The downstream LLM step never received the required data.

This feature must be implemented after telemetry ingestion, storage, traces, and dashboard functionality are working.

## Alerts

AgentPulse will eventually support alerts for:
- high error rate
- high latency
- repeated tool failures
- high token usage
- high cost
- agent failures

Example:

IF error_rate > threshold
        ↓
    Create Alert
        ↓
Slack / Email / Dashboard

Alerts are not part of the first implementation milestone.

## MVP Development Flow

The MVP should be built in this order:

1. Project and API-key foundation
2. Telemetry data model
3. Ingestion API
4. PostgreSQL persistence
5. AgentPulse SDK
6. Demo AI Agent
7. Trace visualization
8. Run Details dashboard
9. Basic error monitoring
10. Metrics

Only after the core flow works should we prioritize:
- AI Root-Cause Analysis
- Alerts
- Multi-tenancy
- Advanced analytics
- Scaling

## First Major Milestone

The first complete end-to-end milestone is:

Demo AI Agent
      ↓
AgentPulse SDK
      ↓
POST /v1/ingest
      ↓
NestJS
      ↓
PostgreSQL
      ↓
Next.js Dashboard
      ↓
Developer sees the Agent Run

If this flow works, AgentPulse has its first real end-to-end functionality.

## Development Principle

Build the smallest version that proves the core idea.

Do not implement advanced distributed systems, complex analytics, multi-tenancy, or AI analysis before the basic telemetry pipeline works.

The priority is:

Capture → Ingest → Store → Query → Visualize.

AgentPulse is an AI-agent observability and reliability platform. It is not a resume analyzer.
