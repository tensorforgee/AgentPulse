# AgentPulse reviewer demo

This walkthrough presents the implemented AgentPulse product through the
realistic support-RAG example. It is designed for a recruiter, interviewer,
reviewer, or hackathon evaluator and takes about five minutes after AgentPulse
is running.

## The story

```text
support question
  -> deterministic support-RAG agent
  -> @agentpulse/sdk trace and nested spans
  -> POST /v1/ingest with a project key
  -> validated PostgreSQL persistence
  -> Runs metrics and trace timeline
  -> failed-span evidence and root-cause analysis
  -> optional alert evaluation and dashboard event
```

The example uses synthetic local data. Its timings, tokens, and costs are
deterministic observability fixtures, not production measurements or provider
charges. It does not call an external AI provider.

## Before the walkthrough

Complete [Getting started](getting-started.md#1-run-agentpulse-locally), or use
an existing deployment from [Deployment](deployment.md). You need:

- a running web app and API;
- a signed-in AgentPulse account;
- a selected organization and preferably a fresh project; and
- a project API key copied from **API keys** when it is created.

A fresh project makes the aggregate values below exact and keeps the reviewer
focused on the two demo traces.

## Five-minute walkthrough

### 1. Connect the example

In PowerShell at the repository root, keep the one-time project key in the
current shell. Use the local API origin below, or replace it with the deployed
API origin:

```powershell
$env:AGENTPULSE_API_KEY = "<your-project-api-key>"
$env:AGENTPULSE_BASE_URL = "http://127.0.0.1:5000"
```

The SDK appends `/v1/ingest`; do not include that path in the base URL.

### 2. Emit a successful support workflow

```powershell
pnpm --filter @agentpulse/support-rag-agent-example start
```

Expected output shape:

```text
Support workflow success: trace <generated-uuid> (4 spans)
```

This invocation answers how to rotate and revoke an API key. It retrieves a
local support document, loads a synthetic customer plan, and produces a
deterministic grounded answer.

### 3. Emit the observable failure

```powershell
pnpm --filter @agentpulse/support-rag-agent-example start -- --simulate-failure
```

Expected output shape:

```text
Support workflow failed: trace <generated-uuid> (3 spans)
```

This is an intentionally failed agent trace, not a broken command. The local
CRM lookup returns `CustomerNotFoundError`, so the workflow records the tool
and trace failures and does not start the LLM span.

### 4. Review the Runs dashboard

Open **Runs** in the project that owns the key. Realtime events normally refresh
the view; refresh the page if the stream is reconnecting.

In a fresh project, the metric cards show:

| Metric          | Expected value       |
| --------------- | -------------------- |
| Total runs      | 2                    |
| Success / error | 50% / 50%            |
| Average latency | 200 ms               |
| Total tokens    | 462                  |
| Total cost      | `$0.00160` estimated |

The newest row is the failed `Resolve customer support question` run. The two
rows differ in status, latency, tokens, estimated cost, and error presentation.
Use search or the status filter to demonstrate project-scoped querying if
useful; filters are not required for the core story.

### 5. Inspect the successful trace

Open the successful row. The trace detail shows a 260 ms run with 378 tokens
and `$0.00150` estimated cost.

| Span                            | Type        | What to point out                                                                                   |
| ------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `support-workflow`              | `agent`     | Root span containing the synthetic request and final grounded answer.                               |
| `search-support-knowledge-base` | `retrieval` | Local document matches, 35 ms latency, and retrieval attributes.                                    |
| `load-customer-plan`            | `tool_call` | Successful synthetic CRM output.                                                                    |
| `draft-grounded-answer`         | `llm_call`  | `local-deterministic` / `support-template-v1`, 145 ms latency, tokens, cost, answer, and citations. |

The child links, timeline bars, provider/model, structured input/output, and
per-span telemetry all come from the SDK payload.

### 6. Inspect the failed trace and RCA

Open the failed row. The trace detail shows a 140 ms run with 84 tokens and
`$0.00010` estimated cost. Its span tree contains:

- failed root `support-workflow` span;
- successful `search-support-knowledge-base` retrieval; and
- failed `load-customer-plan` tool span with `CustomerNotFoundError`.

There is no LLM span because the required customer context was unavailable.
The run-level `SupportWorkflowError` and failed tool evidence are visible
without searching server logs.

Select **Analyze failure**. With no RCA provider configured, AgentPulse returns
the implemented local evidence-based explanation and identifies
`load-customer-plan` as the likely failing `tool_call`. The UI explicitly says
that the AI provider is not configured. If the deployment has
`RCA_PROVIDER_API_KEY` and `RCA_PROVIDER_MODEL`, the same control uses the
configured OpenAI-compatible provider instead; captured span input/output is
not sent to that provider.

### 7. Finish safely

Return to **API keys** and revoke the demo key if it is no longer needed. The
trace data remains available for later review, while the revoked credential can
no longer ingest telemetry.

## Optional: include a triggered alert

The dashboard displays persisted alert events, but it does not currently
provide alert-rule authoring. To include alerts in a local technical demo,
create an implemented error-rate rule through the authenticated API before
running the two workflows.

Use the same local demo account that owns the project. Do not use production
credentials in shell history:

```powershell
$demoApiBase = $env:AGENTPULSE_BASE_URL.TrimEnd("/")
$demoLoginBody = @{
  email = "<demo-account-email>"
  password = "<demo-account-password>"
} | ConvertTo-Json
$demoLogin = Invoke-RestMethod -Method Post -Uri "$demoApiBase/auth/login" -ContentType "application/json" -Body $demoLoginBody
$demoAuthHeaders = @{ Authorization = "Bearer $($demoLogin.accessToken)" }

$demoOrganizations = @(Invoke-RestMethod -Method Get -Uri "$demoApiBase/organizations" -Headers $demoAuthHeaders)
$demoOrganizations | Select-Object id, name, role
$demoOrganizationId = "<organization-id-from-the-list>"

$demoProjects = @(Invoke-RestMethod -Method Get -Uri "$demoApiBase/organizations/$demoOrganizationId/projects" -Headers $demoAuthHeaders)
$demoProjects | Select-Object id, name
$demoProjectId = "<fresh-demo-project-id-from-the-list>"

$demoRuleBody = @{
  name = "Demo error rate"
  type = "error_rate"
  threshold = 0.5
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$demoApiBase/projects/$demoProjectId/alert-rules" -Headers $demoAuthHeaders -ContentType "application/json" -Body $demoRuleBody

Remove-Variable demoLogin, demoLoginBody, demoAuthHeaders
```

Run the success and failure commands within five minutes. In a fresh project,
the failed ingestion evaluates the two completed traces at a 50% error rate,
meeting the `0.5` threshold. **Triggered alerts** then shows `Demo error rate`,
the observed and threshold values, and `Webhook: not configured` unless the
project has an HTTPS webhook mapping in `ALERT_WEBHOOK_URLS_JSON`.

This optional API setup demonstrates implemented alert evaluation and
persistence. It does not imply that rule management exists in the current UI.

## What the demo proves

- A server-side TypeScript agent can create nested traces with the workspace
  SDK and authenticate ingestion with a project key.
- The API resolves tenancy from the key, validates the shared contract, and
  persists the trace and spans transactionally.
- The dashboard queries project-scoped runs, aggregates metrics, and renders
  status, latency, tokens, estimated cost, structured data, errors, and span
  hierarchy.
- Failed traces retain enough operational evidence for a useful local RCA
  fallback without sending captured input/output to an external provider.
- Configured alert rules evaluate persisted completed traces and create
  dashboard-visible alert events; webhook delivery is optional.

## Live screenshot checklist

No product screenshots are checked into the repository because the current
app must be backed by real demo data. If screenshots are needed for a portfolio,
capture them from this walkthrough and use only synthetic data:

- Runs dashboard with both support-RAG traces and aggregate cards.
- Successful trace with the four-span hierarchy and LLM telemetry.
- Failed trace with the tool error and local RCA result.
- Optional triggered-alert event with its observed value and threshold.

Dismiss the one-time key banner first. Do not capture credentials, environment
files, account identifiers, or unrelated project data.

## Troubleshooting the walkthrough

- **No rows appear:** confirm the selected project owns
  `AGENTPULSE_API_KEY`, clear Runs filters, and verify the command printed a
  trace ID and span count.
- **The SDK cannot reach ingestion:** use the API origin in
  `AGENTPULSE_BASE_URL`, without `/v1/ingest`, and confirm
  `/health/live` responds.
- **RCA is unavailable:** RCA is only shown for failed traces. An unconfigured
  provider is expected to return the local evidence-based explanation.
- **No alert appears:** confirm the rule belongs to the same fresh project, was
  created before the traces, remains enabled, and both commands ran within the
  rolling five-minute window. Allow post-ingest processing to finish and then
  refresh Runs.
- **Old data changes the aggregate cards:** use a fresh project; traces are
  intentionally durable and the current product does not provide a demo reset.

For instrumentation details, see the
[support-RAG source guide](../examples/support-rag-agent/README.md). For the
implemented services and trust boundaries, see [Architecture](architecture.md).
