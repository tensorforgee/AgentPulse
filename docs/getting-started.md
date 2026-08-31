# Getting started with AgentPulse

This guide takes a new developer from a local checkout to a trace in the
dashboard. Commands assume PowerShell and the repository root unless stated
otherwise.

## 1. Run AgentPulse locally

### Prerequisites

- Node.js 24
- pnpm 11.22.0 (the version pinned in the root `package.json`)
- PostgreSQL 18 with an empty database available to the API

Install dependencies and create ignored local environment files:

```powershell
pnpm install --frozen-lockfile
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env`:

- Set `DATABASE_URL` to a PostgreSQL database that already exists.
- Replace `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` with different,
  high-entropy values of at least 32 bytes.
- Keep `CORS_ORIGINS=http://localhost:3000` for the default local web URL.

`apps/web/.env.local` should keep this server-only API URL for the default
local setup:

```dotenv
AGENTPULSE_API_URL=http://127.0.0.1:5000
```

Apply the checked-in Prisma migrations, then run the API and web app:

```powershell
pnpm --filter api db:migrate:deploy
pnpm dev
```

Open `http://localhost:3000`. The API listens on
`http://localhost:5000` unless `PORT` is changed.

## 2. Create a project and API key

In the dashboard:

1. Create an account or sign in.
2. Create an organization.
3. Create a project and leave it selected in the workspace header.
4. Open **API keys** and create a named project key.
5. Copy the plaintext key immediately. It is displayed only in the creation
   response and cannot be recovered later.

The key identifies its project during ingestion. Do not send a `projectId` in
telemetry; the API rejects client-supplied project IDs.

For local commands, keep the key in the current shell rather than a tracked
file:

```powershell
$env:AGENTPULSE_API_KEY = "<your-project-api-key>"
$env:AGENTPULSE_BASE_URL = "http://127.0.0.1:5000"
```

## TypeScript SDK quickstart

### Install the package

From your server-side Node.js application, run:

```powershell
pnpm add @agentpulse/sdk
```

Use the registry command only for a version that is visible in your configured
npm registry after an authorized release. The repository does not claim that
its current SDK version has already been published; maintainers can use the
clean-room tarball flow in [SDK release](sdk-release.md) before publication.

The resulting package dependency is:

```json
{
  "dependencies": {
    "@agentpulse/sdk": "<released-version>"
  }
}
```

The SDK requires Node.js 18 or newer. This repository's bundled examples use a
pnpm workspace link during development, but external applications do not need
the AgentPulse monorepo or its internal packages.

`AGENTPULSE_API_KEY` and `AGENTPULSE_BASE_URL` are conventions used by the
repository examples. Pass their values to the SDK constructor; the SDK does
not read environment variables itself. The base URL is the API origin and must
not include `/v1/ingest`, embedded credentials, a query string, or a fragment.

### Send a first trace

Create a server-side TypeScript file in the agent package:

```ts
import { AgentPulse } from "@agentpulse/sdk";

async function main() {
  const apiKey = process.env.AGENTPULSE_API_KEY;
  if (!apiKey) {
    throw new Error("AGENTPULSE_API_KEY is required");
  }

  const pulse = new AgentPulse(
    apiKey,
    process.env.AGENTPULSE_BASE_URL ?? "http://127.0.0.1:5000",
  );

  const trace = pulse.startTrace({
    agentName: "support-agent",
    name: "answer-question",
    metadata: { environment: "local", workflowVersion: "1" },
  });

  const llm = pulse.startSpan(trace, {
    type: "llm_call",
    name: "draft-answer",
    provider: "example-provider",
    model: "example-model",
    input: { question: "How do I rotate an AgentPulse project key?" },
  });

  pulse.endSpan(llm, {
    output: {
      answer:
        "Create a replacement, verify ingestion, then revoke the old key.",
    },
    inputTokens: 120,
    outputTokens: 24,
    estimatedCost: "0.0012",
  });

  const result = await pulse.endTrace(trace);
  console.log(
    `Created trace ${result.traceId} with ${result.spansProcessed} span`,
  );
}

void main();
```

`endTrace()` requires every span to be ended. It then validates and sends one
complete payload. When trace totals are omitted, the SDK sums token counts and
decimal costs from the ended spans.

The default ten-second request timeout and two bounded retries apply only to
network/timeout failures and HTTP `408`, `429`, or `5xx`. Other `4xx` responses
are returned immediately. Use the optional third constructor argument to set
`requestTimeoutMs`, `maxRetries`, or `retryDelayMs`. For callback-scoped
instrumentation, `withTrace` and `withSpan` auto-close success and mark
unfinished telemetry failed while preserving the original callback error.
See the [SDK API reference](sdk-api.md) for all exports and error fields.

Open **Runs** in the selected project and choose the new trace to inspect its
span, timing, token, cost, provider/model, input, and output fields.

### Instrument an OpenAI-compatible chat completion

For an existing non-streaming OpenAI-compatible client, keep the provider call
unchanged and wrap it with the SDK helper. The provider package remains your
application dependency; `@agentpulse/sdk` does not install it.

```ts
import OpenAI from "openai";
import { AgentPulse, traceOpenAIChatCompletion } from "@agentpulse/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pulse = new AgentPulse(
  process.env.AGENTPULSE_API_KEY!,
  process.env.AGENTPULSE_BASE_URL ?? "http://127.0.0.1:5000",
);
const trace = pulse.startTrace({ agentName: "support-agent" });
const request = {
  model: "your-model",
  messages: [{ role: "user" as const, content: "Summarize this ticket" }],
};

const completion = await traceOpenAIChatCompletion(
  pulse,
  trace,
  request,
  () => openai.chat.completions.create(request),
  { provider: "openai" },
).catch(async (error: unknown) => {
  try {
    await pulse.endTrace(trace, {
      status: "failed",
      errorType: error instanceof Error ? error.name : "ProviderError",
      errorMessage: error instanceof Error ? error.message : "Request failed",
    });
  } catch {
    // Do not replace the provider error with a telemetry delivery error.
  }
  throw error;
});

await pulse.endTrace(trace);
console.log(completion.choices[0]?.message.content);
```

The helper records a regular `llm_call` span, returns the exact provider
response, and rethrows the exact provider error. It captures latency, provider,
model, finish reasons, standard token usage, and cost fields when the provider
returns them. It does not capture prompt or completion text. End streaming spans
manually after consuming the full stream.

## Trace and span instrumentation

A trace is one complete agent invocation. Spans are operations within it. The
supported span types are:

- `agent`
- `retrieval`
- `tool_call`
- `llm_call`
- `custom`

Create hierarchy by passing an earlier span ID as `parentSpanId`. End all child
and parent spans before ending the trace.

### Successful nested workflow

With `pulse` configured as in the quickstart, one invocation can contain
nested operations:

```ts
const trace = pulse.startTrace({
  agentName: "support-rag-agent",
  name: "resolve-support-question",
  metadata: { requestId: "support-123", channel: "cli" },
});

const root = pulse.startSpan(trace, {
  type: "agent",
  name: "support-workflow",
  input: { question: "How do I troubleshoot missing traces?" },
});

const retrieval = pulse.startSpan(trace, {
  type: "retrieval",
  name: "search-support-docs",
  parentSpanId: root.id,
  provider: "local-knowledge-base",
  input: { query: "missing traces", topK: 2 },
});

pulse.endSpan(retrieval, {
  output: { documentIds: ["missing-traces", "api-key-rotation"] },
  inputTokens: 12,
  outputTokens: 40,
  estimatedCost: "0",
});

const generation = pulse.startSpan(trace, {
  type: "llm_call",
  name: "draft-grounded-answer",
  parentSpanId: root.id,
  provider: "example-provider",
  model: "example-model",
});

pulse.endSpan(generation, {
  output: { answer: "Check the API URL, project key, and completed spans." },
  inputTokens: 180,
  outputTokens: 32,
  estimatedCost: "0.0014",
});

pulse.endSpan(root, {
  output: { answered: true },
});

await pulse.endTrace(trace);
```

### Failed operation and trace

Record the failure on the span where it occurred and on the trace so the runs
table and trace detail both carry useful context:

```ts
const trace = pulse.startTrace({
  agentName: "support-agent",
  name: "load-customer-context",
});

const tool = pulse.startSpan(trace, {
  type: "tool_call",
  name: "load-customer-plan",
  provider: "customer-database",
  input: { customerId: "customer-missing" },
});

const failure = new Error("Customer customer-missing was not found");

pulse.endSpan(tool, {
  status: "failed",
  output: { customerFound: false, retryable: false },
  estimatedCost: "0",
  errorType: "CustomerNotFoundError",
  errorMessage: failure.message,
  errorStack: failure.stack,
});

await pulse.endTrace(trace, {
  status: "failed",
  errorType: "SupportWorkflowError",
  errorMessage: "Customer context is required before answering",
});
```

When `status` is omitted, `endSpan()` and `endTrace()` infer `failed` if an
error type or message is provided; otherwise they use `success`. Explicit
failure status is recommended where an operation is caught and handled.

For a complete runnable workflow with agent, retrieval, tool, and LLM spans,
see the [support RAG example](../examples/support-rag-agent/README.md) and its
[`workflow.ts`](../examples/support-rag-agent/src/workflow.ts). It includes both
successful and failed invocations without requiring an external AI provider.

## Ingest API reference

The TypeScript SDK is the supported convenience layer over the implemented
ingest endpoint:

```http
POST /v1/ingest
Authorization: Bearer <project-api-key>
Content-Type: application/json
```

The request body is `TraceWithSpansContract` without `projectId`. The API key
resolves the project. A valid request returns HTTP `202`:

```json
{
  "traceId": "9e04bfe5-9c5e-4dd0-829d-3044b7c8e58f",
  "spansProcessed": 3
}
```

If integrating without the SDK, use the implemented contract in
[`packages/shared/src/telemetry.ts`](../packages/shared/src/telemetry.ts). In
particular:

- Trace, span, and parent IDs are UUIDs.
- Every span `traceId` matches the trace ID.
- Timestamps are ISO 8601 strings with a timezone.
- Token counts and durations are non-negative integers.
- Costs are non-negative decimal strings with at most eight fractional digits.
- A parent span belongs to the same trace.
- `projectId` is omitted from the request body.

The dashboard's authenticated read and management routes are internal to the
web application. They are not presented as a public client API.

## API key and telemetry security

- A project key is shown once at creation. AgentPulse stores a SHA-256 digest
  and a non-secret display prefix, not the raw key.
- Use the key only in server-side agents. Never expose it in browser bundles,
  source control, screenshots, logs, or error messages.
- To rotate a key, create a replacement, update the agent environment, verify a
  new trace arrives, then revoke the old key.
- Revoked or expired keys return HTTP `401` from ingestion.
- Use HTTPS for non-local API origins and store production keys in a secret
  manager.
- Input, output, metadata, attributes, error messages, and error stacks are
  persisted telemetry. Redact or omit secrets, credentials, personal data, and
  other content your policy does not allow AgentPulse to store.

## Run the repository examples

With `AGENTPULSE_API_KEY` and `AGENTPULSE_BASE_URL` set, run the realistic
support-RAG workflow used by the [reviewer demo](demo.md):

```powershell
pnpm --filter @agentpulse/support-rag-agent-example start
pnpm --filter @agentpulse/support-rag-agent-example start -- --simulate-failure
```

For a smaller deterministic SDK regression workload that emits both outcomes
in one command, run:

```powershell
pnpm demo
```

Both examples use synthetic local data, print trace IDs and span counts, and
do not print the API key or call an external AI provider.

## Troubleshooting

### The API does not start

- Confirm PostgreSQL is running and the database in `DATABASE_URL` exists.
- Run `pnpm --filter api db:migrate:status` to inspect migration state, then
  `pnpm --filter api db:migrate:deploy` to apply checked-in migrations.
- Confirm the JWT secrets in `apps/api/.env` are different and at least 32
  bytes.

### The web app cannot reach the API

- Confirm the API answers at `http://127.0.0.1:5000/health/live`.
- Confirm `apps/web/.env.local` contains
  `AGENTPULSE_API_URL=http://127.0.0.1:5000`.
- Restart the web development process after changing `.env.local`.

### The SDK reports that it cannot reach ingestion

- `AGENTPULSE_BASE_URL` must be the API origin, such as
  `http://127.0.0.1:5000`; do not append `/v1/ingest`.
- Confirm the API is running and reachable from the agent process.
- Use an `http://` URL only for local development. Use HTTPS in production.

### Ingestion returns an HTTP error

- `401`: the project key is invalid, expired, or revoked. A dashboard JWT is
  not a project API key.
- `400`: the payload failed the shared telemetry contract. If bypassing the
  SDK, check UUIDs, timestamps, decimal cost strings, parent IDs, and that
  `projectId` is absent.
- `409`: a trace or span UUID already belongs to another project or trace.
- `429`: the configured ingestion rate limit was exceeded.

`AgentPulseIngestError` exposes the HTTP status but intentionally does not
include response bodies or credentials in its message.

### `endTrace()` says spans are unfinished

Call `endSpan()` for every span before `endTrace()`. Do not start or end spans
after their trace has ended, and only use trace/span handles created by the same
`AgentPulse` client.

### The request succeeds but the trace is not visible

- Select the project that owns the API key used for ingestion.
- Check the **Runs** filters and clear them if necessary.
- Confirm the command printed the expected trace ID and span count.
- Refresh **Runs** if the best-effort realtime connection is unavailable.

### The SDK import cannot be resolved

Confirm that `@agentpulse/sdk` is listed in the application's dependencies,
reinstall with the application's package manager, and verify that Node.js 18 or
newer is in use. Inside this repository, the bundled examples intentionally use
the local workspace package.

### The SDK rejects a lifecycle call immediately

The SDK validates required trace/span names, span types, timestamps, completion
statuses, and base URLs at the call that supplies them. Timestamps must include
a timezone. Use the API origin as `baseUrl`; endpoint URLs, embedded
credentials, query strings, and fragments are rejected.

## Verify the integration

These checks exercise the SDK contract and both bundled examples without
requiring an external AI provider:

```powershell
pnpm --filter @agentpulse/sdk test
pnpm --filter @agentpulse/demo-agent test
pnpm --filter @agentpulse/support-rag-agent-example test
```

For the database-to-dashboard path, follow the [reviewer demo](demo.md). For
production variables, migration ordering, health probes, TLS, and Docker
Compose, continue to [Deployment](deployment.md).
