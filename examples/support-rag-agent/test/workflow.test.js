const assert = require("node:assert/strict");
const test = require("node:test");
const { AgentPulse } = require("@agentpulse/sdk");
const {
  FAILURE_DURATION_MS,
  SUCCESS_DURATION_MS,
  runSupportWorkflow,
} = require("../dist/workflow");

function captureTelemetry(testBody) {
  return async () => {
    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = async (url, request) => {
      const payload = JSON.parse(request.body);
      requests.push({ url: String(url), request, payload });
      return new Response(
        JSON.stringify({
          traceId: payload.id,
          spansProcessed: payload.spans.length,
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    };

    try {
      await testBody(requests);
    } finally {
      global.fetch = originalFetch;
    }
  };
}

test(
  "instruments a grounded support answer as one trace with nested spans",
  captureTelemetry(async (requests) => {
    const client = new AgentPulse("test-project-key", "http://localhost:5000");
    const result = await runSupportWorkflow(
      client,
      {
        requestId: "support-success",
        customerId: "customer-123",
        question: "How do I rotate and revoke an API key?",
      },
      Date.parse("2026-08-23T10:00:00Z"),
    );

    assert.equal(result.status, "success");
    assert.equal(requests.length, 1);
    const [{ url, payload }] = requests;
    assert.equal(url, "http://localhost:5000/v1/ingest");
    assert.equal(payload.status, "success");
    assert.equal(payload.durationMs, SUCCESS_DURATION_MS);
    assert.deepEqual(
      payload.spans.map((span) => span.type),
      ["agent", "retrieval", "tool_call", "llm_call"],
    );
    assert.ok(
      payload.spans
        .slice(1)
        .every((span) => span.parentSpanId === payload.spans[0].id),
    );
    assert.equal(payload.spans[3].provider, "local-deterministic");
    assert.equal(payload.spans[3].latencyMs, 145);
    assert.equal(payload.totalTokens, 378);
    assert.equal(payload.totalCost, "0.0015");
    assert.equal(Object.hasOwn(payload, "projectId"), false);
  }),
);

test(
  "records a failed account tool and failed trace without calling an LLM",
  captureTelemetry(async (requests) => {
    const client = new AgentPulse("test-project-key", "http://localhost:5000");
    const result = await runSupportWorkflow(
      client,
      {
        requestId: "support-failure",
        customerId: "customer-missing",
        question: "Why are traces missing for this customer?",
        simulateAccountFailure: true,
      },
      Date.parse("2026-08-23T10:00:00Z"),
    );

    assert.equal(result.status, "failed");
    assert.equal(requests.length, 1);
    const [{ payload }] = requests;
    assert.equal(payload.status, "failed");
    assert.equal(payload.durationMs, FAILURE_DURATION_MS);
    assert.equal(payload.errorType, "SupportWorkflowError");
    assert.deepEqual(
      payload.spans.map((span) => span.type),
      ["agent", "retrieval", "tool_call"],
    );
    assert.equal(payload.spans[2].status, "failed");
    assert.equal(payload.spans[2].errorType, "CustomerNotFoundError");
    assert.equal(payload.spans[2].parentSpanId, payload.spans[0].id);
    assert.equal(payload.totalTokens, 84);
    assert.equal(payload.totalCost, "0.0001");
  }),
);
