const { inspect } = require("node:util");
const assert = require("node:assert/strict");
const test = require("node:test");
const { assertTraceWithSpansContract } = require("@agentpulse/shared");
const {
  AgentPulse,
  AgentPulseIngestError,
  AgentPulseRequestError,
  AgentPulseValidationError,
  traceOpenAIChatCompletion,
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

test("public calls reject invalid values at the lifecycle boundary", () => {
  assert.throws(
    () => new AgentPulse("test-key", "https://user:secret@pulse.example"),
    /must not include embedded credentials/,
  );
  assert.throws(
    () => new AgentPulse("test-key", "https://pulse.example/v1/ingest"),
    /without \/v1\/ingest/,
  );

  const client = new AgentPulse("test-key", "https://pulse.example");
  assert.throws(
    () => client.startTrace({ agentName: "   " }),
    /agentName must be a non-empty string/,
  );
  assert.throws(
    () => client.startTrace({ agentName: "agent", startedAt: "not-a-date" }),
    /startedAt must be an ISO 8601 timestamp with a timezone/,
  );

  const trace = client.startTrace({ agentName: "agent" });
  assert.throws(
    () => client.startSpan(trace),
    /Span options are required/,
  );
  assert.throws(
    () => client.startSpan(trace, { type: "database", name: "query" }),
    /type must be one of/,
  );
  assert.throws(
    () => client.startSpan(trace, { type: "custom", name: "" }),
    /name must be a non-empty string/,
  );
});

test("a failed ingestion can be retried without rebuilding the trace", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (_url, options) => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("temporary network failure");
    }
    const payload = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ traceId: payload.id, spansProcessed: 0 }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = new AgentPulse("test-key", "https://pulse.example", {
      maxRetries: 0,
    });
    const trace = client.startTrace({ agentName: "retry-agent" });
    await assert.rejects(client.endTrace(trace), /Unable to reach/);
    await assert.doesNotReject(client.endTrace(trace));
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("ingestion retries only network, 408, 429, and 5xx failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const retryableStatus of [408, 429, 500, 503]) {
      let attempts = 0;
      globalThis.fetch = async (_url, options) => {
        attempts += 1;
        const payload = JSON.parse(options.body);
        if (attempts === 1) {
          return new Response(null, { status: retryableStatus });
        }
        return new Response(
          JSON.stringify({ traceId: payload.id, spansProcessed: 0 }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      };

      const client = new AgentPulse("test-key", "https://pulse.example", {
        maxRetries: 1,
        retryDelayMs: 0,
      });
      await client.endTrace(
        client.startTrace({ agentName: `retry-${retryableStatus}` }),
      );
      assert.equal(attempts, 2);
    }

    for (const status of [400, 401, 403, 404, 409, 422]) {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts += 1;
        return new Response(null, { status });
      };

      const client = new AgentPulse("test-key", "https://pulse.example", {
        maxRetries: 2,
        retryDelayMs: 0,
      });
      await assert.rejects(
        client.endTrace(client.startTrace({ agentName: `no-retry-${status}` })),
        (error) => {
          assert.ok(error instanceof AgentPulseIngestError);
          assert.equal(error.status, status);
          assert.equal(error.attempts, 1);
          assert.equal(error.retryable, false);
          return true;
        },
      );
      assert.equal(attempts, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exhausted retries and timeouts expose safe bounded diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  const apiKey = "retry-sensitive-api-key";

  try {
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return new Response(null, { status: 503 });
    };
    const retryClient = new AgentPulse(apiKey, "https://pulse.example", {
      maxRetries: 1,
      retryDelayMs: 0,
    });
    await assert.rejects(
      retryClient.endTrace(
        retryClient.startTrace({ agentName: "retry-diagnostics" }),
      ),
      (error) => {
        assert.ok(error instanceof AgentPulseIngestError);
        assert.equal(error.status, 503);
        assert.equal(error.attempts, 2);
        assert.equal(error.retryable, true);
        assert.equal(String(error).includes(apiKey), false);
        return true;
      },
    );
    assert.equal(attempts, 2);

    globalThis.fetch = async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true },
        );
      });
    const timeoutClient = new AgentPulse(apiKey, "https://pulse.example", {
      requestTimeoutMs: 5,
      maxRetries: 0,
    });
    await assert.rejects(
      timeoutClient.endTrace(
        timeoutClient.startTrace({ agentName: "timeout-diagnostics" }),
      ),
      (error) => {
        assert.ok(error instanceof AgentPulseRequestError);
        assert.equal(error.attempts, 1);
        assert.equal(error.retryable, true);
        assert.equal(String(error).includes(apiKey), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scoped lifecycle helpers close successful and failed operations", async () => {
  const originalFetch = globalThis.fetch;
  const payloads = [];
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    payloads.push(payload);
    return new Response(
      JSON.stringify({ traceId: payload.id, spansProcessed: payload.spans.length }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = new AgentPulse("test-key", "https://pulse.example", {
      maxRetries: 0,
    });
    const successResult = await client.withTrace(
      { agentName: "scoped-success" },
      (trace) =>
        client.withSpan(
          trace,
          { type: "tool_call", name: "scoped-tool" },
          async () => "provider-result",
          { output: { completed: true } },
        ),
    );
    assert.equal(successResult, "provider-result");
    assert.equal(payloads[0].status, "success");
    assert.equal(payloads[0].spans[0].status, "success");

    const operationError = new TypeError("Scoped provider failed");
    let caught;
    try {
      await client.withTrace({ agentName: "scoped-failure" }, (trace) =>
        client.withSpan(
          trace,
          { type: "llm_call", name: "scoped-llm" },
          async () => {
            throw operationError;
          },
        ),
      );
    } catch (error) {
      caught = error;
    }

    assert.equal(caught, operationError);
    assert.equal(payloads[1].status, "failed");
    assert.equal(payloads[1].errorType, "TypeError");
    assert.equal(payloads[1].spans[0].status, "failed");
    assert.equal(payloads[1].spans[0].errorMessage, operationError.message);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI-compatible integration records usage and preserves the response", async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ traceId: payload.id, spansProcessed: 1 }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = new AgentPulse("test-key", "https://pulse.example");
    const trace = client.startTrace({ agentName: "openai-compatible-agent" });
    const providerResponse = {
      id: "chatcmpl-test",
      model: "compatible-model-v2",
      choices: [{ finish_reason: "stop", message: { content: "Done" } }],
      usage: {
        prompt_tokens: 21,
        completion_tokens: 7,
        total_cost: "0.0042",
      },
    };

    const response = await traceOpenAIChatCompletion(
      client,
      trace,
      {
        model: "compatible-model-v1",
        messages: [{ role: "user", content: "Help" }],
      },
      async () => providerResponse,
      { provider: "test-provider" },
    );
    assert.equal(response, providerResponse);
    await client.endTrace(trace);

    const [span] = payload.spans;
    assert.equal(span.type, "llm_call");
    assert.equal(span.status, "success");
    assert.equal(span.provider, "test-provider");
    assert.equal(span.model, "compatible-model-v2");
    assert.equal(span.inputTokens, 21);
    assert.equal(span.outputTokens, 7);
    assert.equal(span.estimatedCost, "0.0042");
    assert.equal(span.input.messageCount, 1);
    assert.deepEqual(span.output.finishReasons, ["stop"]);
    assert.ok(Number.isSafeInteger(span.latencyMs));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI-compatible integration records failure and rethrows the same error", async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ traceId: payload.id, spansProcessed: 1 }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = new AgentPulse("test-key", "https://pulse.example");
    const trace = client.startTrace({ agentName: "openai-compatible-agent" });
    const providerError = new TypeError("Provider unavailable");
    let caught;

    try {
      await traceOpenAIChatCompletion(
        client,
        trace,
        { model: "compatible-model" },
        async () => {
          throw providerError;
        },
      );
    } catch (error) {
      caught = error;
    }

    assert.equal(caught, providerError);
    await client.endTrace(trace, {
      status: "failed",
      errorType: providerError.name,
      errorMessage: providerError.message,
    });

    const [span] = payload.spans;
    assert.equal(span.status, "failed");
    assert.equal(span.errorType, "TypeError");
    assert.equal(span.errorMessage, "Provider unavailable");
    assert.equal(span.estimatedCost, "0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
