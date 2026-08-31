# SDK API reference

`@agentpulse/sdk` is a server-side Node.js package for sending completed traces
to AgentPulse. It supports Node.js 18 or newer, CommonJS, ES modules, and
TypeScript. The package has no runtime dependencies.

## Client

```ts
new AgentPulse(apiKey, baseUrl, options?)
```

The existing two-argument constructor remains supported. `apiKey` must be a
non-empty project API key. `baseUrl` is the HTTP(S) AgentPulse API origin; do
not include `/v1/ingest`, credentials, a query string, or a fragment.

`AgentPulseOptions` has these optional fields:

| Field | Default | Constraint |
| --- | ---: | --- |
| `requestTimeoutMs` | `10000` | Positive safe integer |
| `maxRetries` | `2` | Safe integer from `0` through `5` |
| `retryDelayMs` | `100` | Safe integer from `0` through `10000` |

The retry delay doubles after each failed attempt and is capped at ten
seconds. The SDK retries only network/timeout failures and HTTP `408`, `429`,
and `5xx` responses. It does not retry other `4xx` responses.

## Trace lifecycle

`startTrace(options)` returns an `AgentPulseTrace` handle. `StartTraceOptions`
requires `agentName` and accepts `name`, `id`, `startedAt`, and `metadata`.

`startSpan(trace, options)` returns an `AgentPulseSpan` handle.
`StartSpanOptions` requires `type` and `name`, and accepts `id`,
`parentSpanId`, `startedAt`, `input`, `provider`, `model`, and `attributes`.
The public `SpanType` values are `agent`, `retrieval`, `tool_call`, `llm_call`,
and `custom`.

`endSpan(span, options?)` completes a span. `EndSpanOptions` accepts `status`,
`endedAt`, `latencyMs`, input/output, token counts, `estimatedCost`, provider,
model, attributes, and error details. Omitted token counts and costs default to
zero. An error field makes the default status `failed`; otherwise it defaults
to `success`.

`endTrace(trace, options?)` validates and sends the complete trace, returning
`Promise<IngestResponse>`. All spans must be ended first. `EndTraceOptions`
accepts status, timestamps/duration, totals, metadata, and error details.
Omitted totals are calculated from completed spans. A completed trace may be
sent again after a retryable delivery failure without rebuilding it.

Timestamp inputs are `Date` values or ISO 8601 strings with a timezone. Costs
are non-negative decimal strings with at most eight decimal places.

## Scoped lifecycle helpers

```ts
await pulse.withSpan(trace, spanOptions, async (span) => {
  // operation
}, endSpanOptions);

await pulse.withTrace(traceOptions, async (trace) => {
  // operation; use withSpan or the manual span methods here
}, endTraceOptions);
```

`withSpan` closes the span after success unless the callback already did so.
On callback failure it marks an unfinished span failed and rethrows the exact
callback error.

`withTrace` closes and sends the trace after success unless the callback
already did so. On callback failure it marks every unfinished span and the
trace failed, attempts delivery, and rethrows the exact callback error even if
telemetry cleanup or delivery also fails. Both helpers return the callback's
result.

## OpenAI-compatible helper

`traceOpenAIChatCompletion(client, trace, request, createCompletion, options?)`
wraps one non-streaming OpenAI-compatible chat completion. It invokes the
provider callback exactly once, returns the exact response, and rethrows the
exact provider error. The resulting `llm_call` span records latency, provider,
model, finish reasons, standard token usage, and provider-reported cost fields
when available. It does not include a pricing table or capture message text.
The provider client remains an application dependency.

Streaming is not handled by this helper; use the normal span lifecycle and end
the span after fully consuming the stream.

## Errors

All SDK errors extend `AgentPulseError`:

- `AgentPulseValidationError` reports invalid constructor, lifecycle, or
  telemetry input before sending.
- `AgentPulseRequestError` reports exhausted network/timeout attempts. Its
  public `attempts` count and `retryable: true` are safe to log.
- `AgentPulseIngestError` reports a non-success HTTP status. Its public
  `status`, `attempts`, and `retryable` fields are safe to log.
- `AgentPulseError` is also used for an invalid successful ingestion response.

Error messages never contain the project API key, authorization header,
request body, response body, or webhook/provider credentials.

## Public types

The package exports every type used by its public signatures:

- `AgentPulseOptions`, `AgentPulseTrace`, `AgentPulseSpan`
- `StartTraceOptions`, `EndTraceOptions`, `StartSpanOptions`, `EndSpanOptions`
- `FinishedStatus`, `TimestampInput`, `SpanType`, `DecimalString`
- `JsonValue`, `JsonObject`, `IngestPayload`, `IngestResponse`
- `OpenAICompatibleChatRequest`, `OpenAICompatibleChatCompletion`, and
  `TraceOpenAIChatCompletionOptions`

See [Getting started](getting-started.md) for an external application example
and [SDK release](sdk-release.md) for clean-room package validation.
