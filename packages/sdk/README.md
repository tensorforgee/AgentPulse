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

The package supports both ES module imports and CommonJS `require()` and ships
its TypeScript declarations. See the
[AgentPulse getting-started guide](https://github.com/tensorforgee/AgentPulse/blob/main/docs/getting-started.md)
for nested spans, failure instrumentation, and troubleshooting.
