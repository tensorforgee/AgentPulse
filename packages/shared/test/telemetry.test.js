const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const {
  SPAN_TYPES,
  assertSpanContract,
  assertTraceContract,
  assertTraceWithSpansContract,
} = require("../dist");

function representativeTelemetry() {
  const traceId = randomUUID();
  const rootSpanId = randomUUID();
  const llmSpanId = randomUUID();
  const toolSpanId = randomUUID();

  return {
    id: traceId,
    projectId: randomUUID(),
    agentName: "support-agent",
    name: "Resolve support request",
    status: "success",
    startedAt: "2026-08-21T00:00:00.000Z",
    endedAt: "2026-08-21T00:00:01.250Z",
    durationMs: 1250,
    inputTokens: 120,
    outputTokens: 80,
    totalTokens: 200,
    totalCost: "0.00420000",
    metadata: { environment: "test" },
    spans: [
      {
        id: rootSpanId,
        traceId,
        type: "agent",
        name: "Plan response",
        status: "success",
        startedAt: "2026-08-21T00:00:00.000Z",
        endedAt: "2026-08-21T00:00:01.250Z",
        latencyMs: 1250,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: "0",
        attributes: { step: 1 },
      },
      {
        id: llmSpanId,
        traceId,
        parentSpanId: rootSpanId,
        type: "llm_call",
        name: "Generate answer",
        status: "success",
        startedAt: "2026-08-21T00:00:00.100Z",
        endedAt: "2026-08-21T00:00:01.000Z",
        latencyMs: 900,
        input: { prompt: "[redacted]" },
        output: { completion: "[redacted]" },
        inputTokens: 120,
        outputTokens: 80,
        estimatedCost: "0.00400000",
        provider: "example-provider",
        model: "example-model",
      },
      {
        id: toolSpanId,
        traceId,
        parentSpanId: llmSpanId,
        type: "tool_call",
        name: "lookup_account",
        status: "success",
        startedAt: "2026-08-21T00:00:00.300Z",
        endedAt: "2026-08-21T00:00:00.500Z",
        latencyMs: 200,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: "0.00020000",
      },
    ],
  };
}

test("a representative trace with nested spans fits the contracts", () => {
  const telemetry = representativeTelemetry();

  assert.doesNotThrow(() => assertTraceWithSpansContract(telemetry));
  assert.equal(telemetry.spans[0].parentSpanId, undefined);
  assert.equal(telemetry.totalTokens, 200);
  assert.equal(telemetry.totalCost, "0.00420000");
  assert.equal(telemetry.spans[1].inputTokens, 120);
  assert.equal(telemetry.spans[1].estimatedCost, "0.00400000");
  assert.ok(SPAN_TYPES.includes("retrieval"));
});

test("invalid trace status and span type are rejected", () => {
  const telemetry = representativeTelemetry();

  assert.throws(
    () => assertTraceContract({ ...telemetry, status: "completed" }),
    /trace\.status/,
  );
  assert.throws(
    () => assertSpanContract({ ...telemetry.spans[0], type: "database" }),
    /span\.type/,
  );
});

test("root parentSpanId is optional and cross-trace parents are rejected", () => {
  const telemetry = representativeTelemetry();
  const rootSpan = telemetry.spans[0];

  assert.doesNotThrow(() => assertSpanContract(rootSpan));
  assert.throws(
    () =>
      assertTraceWithSpansContract({
        ...telemetry,
        spans: [
          rootSpan,
          {
            ...telemetry.spans[1],
            traceId: randomUUID(),
          },
        ],
      }),
    /span\.traceId must equal trace\.id/,
  );
});
