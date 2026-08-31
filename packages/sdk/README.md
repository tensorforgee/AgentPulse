# `@agentpulse/sdk`

The TypeScript SDK for manually instrumenting AI-agent traces and spans in
AgentPulse.

## Requirements

- Node.js 18 or newer
- An AgentPulse project API key
- An AgentPulse API URL

Keep project API keys in server-side environment variables or a secret manager.
Do not include them in browser bundles or commit them to source control.

## Install

For a version available in your configured npm registry:

```bash
npm install @agentpulse/sdk
```

```bash
pnpm add @agentpulse/sdk
```

## Send a trace

```ts
import { AgentPulse } from "@agentpulse/sdk";

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
});
const span = pulse.startSpan(trace, {
  type: "llm_call",
  name: "generate-answer",
  input: { question: "How do I rotate a project key?" },
});

pulse.endSpan(span, {
  output: {
    answer: "Create a replacement, verify it, then revoke the old key.",
  },
  inputTokens: 120,
  outputTokens: 24,
  estimatedCost: "0.0012",
});

const result = await pulse.endTrace(trace);
console.log(result.traceId, result.spansProcessed);
```

Pass the AgentPulse API origin as `baseUrl`; do not append `/v1/ingest`. The SDK
does not read environment variables itself. `endTrace()` validates the complete
trace and sends it using the project API key.

After the request succeeds, open **Runs** in AgentPulse, select the project that
owns the key, and inspect the returned trace ID.

The package supports both ES module imports and CommonJS `require()` and ships
its TypeScript declarations. It times ingestion requests out after ten seconds
and retries network failures plus HTTP `408`, `429`, and `5xx` responses at
most twice by default; normal `4xx` responses are not retried. The existing
two-argument constructor remains supported, with optional retry/timeout
settings in its third argument.

Use `withTrace` and `withSpan` when you want callbacks to close successful
telemetry automatically and mark failures before preserving the original
application error. See the
[AgentPulse getting-started guide](https://github.com/tensorforgee/AgentPulse/blob/main/docs/getting-started.md)
for an external application path and the
[SDK API reference](https://github.com/tensorforgee/AgentPulse/blob/main/docs/sdk-api.md)
for complete options, lifecycle, error, and public-type documentation.

## OpenAI-compatible chat completions

For a non-streaming OpenAI-compatible client, wrap the normal provider call in
`traceOpenAIChatCompletion`. The helper returns the same completion and
rethrows the same provider error. It records an ordinary `llm_call` span with
latency, model, finish reasons, standard usage token fields, and provider cost
fields when present. Prompt and completion text are not captured.

Install the provider client separately; it is not an SDK runtime dependency:

```bash
npm install openai
```

```ts
import OpenAI from "openai";
import { AgentPulse, traceOpenAIChatCompletion } from "@agentpulse/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pulse = new AgentPulse(
  process.env.AGENTPULSE_API_KEY!,
  process.env.AGENTPULSE_BASE_URL!,
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

The helper intentionally covers completed chat completions only. Instrument a
stream manually so the span ends after the stream is fully consumed.
