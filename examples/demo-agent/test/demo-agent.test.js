const assert = require("node:assert/strict");
const test = require("node:test");
const { AgentPulse } = require("@agentpulse/sdk");
const {
  FAILURE_DURATION_MS,
  SUCCESS_DURATION_MS,
  runFailedToolAgent,
  runSuccessfulResearchAgent,
} = require("../src/scenarios");

function withFetchStub(testBody) {
  return async () => {
    const originalFetch = global.fetch;
    const payloads = [];
    global.fetch = async (_url, request) => {
      const payload = JSON.parse(request.body);
      payloads.push(payload);
      return new Response(
        JSON.stringify({
          traceId: payload.id,
          spansProcessed: payload.spans.length,
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    };

    try {
      await testBody(payloads);
    } finally {
      global.fetch = originalFetch;
    }
  };
}

test(
  "creates a successful trace with nested retrieval and LLM spans",
  withFetchStub(async (payloads) => {
    const client = new AgentPulse("test-key-not-secret", "http://localhost:5000");
    await runSuccessfulResearchAgent(client, Date.parse("2026-08-21T10:00:00Z"));

    assert.equal(payloads.length, 1);
    const [trace] = payloads;
    assert.equal(trace.status, "success");
    assert.equal(trace.durationMs, SUCCESS_DURATION_MS);
    assert.equal(trace.spans.length, 3);
    assert.deepEqual(
      trace.spans.map((span) => span.type),
      ["agent", "retrieval", "llm_call"],
    );
    assert.equal(trace.spans[1].parentSpanId, trace.spans[0].id);
    assert.equal(trace.spans[2].parentSpanId, trace.spans[0].id);
    assert.equal(trace.totalTokens, 566);
    assert.equal(trace.totalCost, "0.0134");
  }),
);

test(
  "creates a failed trace with a nested failed tool span",
  withFetchStub(async (payloads) => {
    const client = new AgentPulse("test-key-not-secret", "http://localhost:5000");
    await runFailedToolAgent(client, Date.parse("2026-08-21T10:00:00Z"));

    assert.equal(payloads.length, 1);
    const [trace] = payloads;
    assert.equal(trace.status, "failed");
    assert.equal(trace.durationMs, FAILURE_DURATION_MS);
    assert.equal(trace.errorType, "AgentExecutionError");
    assert.equal(trace.spans.length, 2);
    assert.equal(trace.spans[1].type, "tool_call");
    assert.equal(trace.spans[1].status, "failed");
    assert.equal(trace.spans[1].parentSpanId, trace.spans[0].id);
    assert.equal(trace.totalTokens, 28);
    assert.equal(trace.totalCost, "0.0003");
  }),
);
