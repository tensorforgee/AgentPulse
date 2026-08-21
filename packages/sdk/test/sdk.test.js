const { inspect } = require("node:util");
const assert = require("node:assert/strict");
const test = require("node:test");
const { assertTraceWithSpansContract } = require("@agentpulse/shared");
const {
  AgentPulse,
  AgentPulseIngestError,
  AgentPulseValidationError,
} = require("../dist");

const PROJECT_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

test("trace/span lifecycle sends validated nested telemetry", async () => {
  const originalFetch = globalThis.fetch;
  const apiKey = "sdk-test-key-fixture";
  const traceId = "10000000-0000-4000-8000-000000000001";
  const rootSpanId = "20000000-0000-4000-8000-000000000001";
  const childSpanId = "30000000-0000-4000-8000-000000000001";
  let captured;

  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ traceId, spansProcessed: 2 }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new AgentPulse(apiKey, "http://localhost:5000/");
    const trace = client.startTrace({
      id: traceId,
      agentName: "manual-agent",
      name: "Manual run",
      startedAt: "2026-08-21T10:00:00.000Z",
      metadata: { environment: "test" },
    });
    const root = client.startSpan(trace, {
      id: rootSpanId,
      type: "agent",
      name: "agent-root",
      startedAt: "2026-08-21T10:00:00.000Z",
      input: { request: "help" },
    });
    const child = client.startSpan(trace, {
      id: childSpanId,
      parentSpanId: root.id,
      type: "llm_call",
      name: "generate-answer",
      startedAt: "2026-08-21T10:00:00.100Z",
      input: { prompt: "Help the user" },
      provider: "openai",
      model: "test-model",
    });

    client.endSpan(child, {
      endedAt: "2026-08-21T10:00:00.900Z",
      output: { answer: "Done" },
      inputTokens: 12,
      outputTokens: 8,
      estimatedCost: "0.0025",
      attributes: { temperature: 0 },
    });
    client.endSpan(root, {
      endedAt: "2026-08-21T10:00:01.000Z",
      output: { completed: true },
    });
    const response = await client.endTrace(trace, {
      endedAt: "2026-08-21T10:00:01.000Z",
    });

    assert.deepEqual(response, { traceId, spansProcessed: 2 });
    assert.equal(captured.url, "http://localhost:5000/v1/ingest");
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.authorization, `Bearer ${apiKey}`);
    assert.equal(captured.options.headers["content-type"], "application/json");

    const payload = JSON.parse(captured.options.body);
    assert.equal(Object.hasOwn(payload, "projectId"), false);
    assert.equal(payload.totalTokens, 20);
    assert.equal(payload.totalCost, "0.0025");
    assert.equal(payload.spans[1].parentSpanId, rootSpanId);
    assert.equal(payload.spans[1].latencyMs, 800);
    assert.deepEqual(payload.spans[1].input, { prompt: "Help the user" });
    assert.deepEqual(payload.spans[1].output, { answer: "Done" });
    assert.doesNotThrow(() =>
      assertTraceWithSpansContract({
        ...payload,
        projectId: PROJECT_PLACEHOLDER,
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lifecycle rejects invalid nesting and open spans", async () => {
  const client = new AgentPulse("test-key", "https://pulse.example");
  const trace = client.startTrace({ agentName: "validation-agent" });

  assert.throws(
    () =>
      client.startSpan(trace, {
        type: "tool_call",
        name: "orphan",
        parentSpanId: "40000000-0000-4000-8000-000000000001",
      }),
    AgentPulseValidationError,
  );

  client.startSpan(trace, { type: "retrieval", name: "open-span" });
  await assert.rejects(client.endTrace(trace), AgentPulseValidationError);
});

test("non-2xx errors are useful and never expose the API key", async () => {
  const originalFetch = globalThis.fetch;
  const apiKey = "sdk-sensitive-fixture-value";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: apiKey }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });

  try {
    const client = new AgentPulse(apiKey, "https://pulse.example");
    const trace = client.startTrace({ agentName: "error-agent" });

    await assert.rejects(client.endTrace(trace), (error) => {
      assert.ok(error instanceof AgentPulseIngestError);
      assert.equal(error.status, 401);
      assert.match(error.message, /HTTP status 401/);
      assert.equal(String(error).includes(apiKey), false);
      assert.equal(JSON.stringify(error).includes(apiKey), false);
      assert.equal(inspect(error).includes(apiKey), false);
      assert.equal(inspect(client).includes(apiKey), false);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
