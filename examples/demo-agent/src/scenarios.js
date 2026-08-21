const SUCCESS_DURATION_MS = 2_350;
const FAILURE_DURATION_MS = 1_180;

async function runSuccessfulResearchAgent(client, now = Date.now()) {
  const trace = client.startTrace({
    agentName: "demo-research-agent",
    name: "Demo: research answer",
    startedAt: new Date(now),
    metadata: { demo: true, scenario: "success", environment: "local" },
  });
  const root = client.startSpan(trace, {
    type: "agent",
    name: "research-workflow",
    startedAt: new Date(now),
    input: { question: "Why is observability important for AI agents?" },
    attributes: { demo: true },
  });
  const retrieval = client.startSpan(trace, {
    type: "retrieval",
    name: "retrieve-knowledge",
    parentSpanId: root.id,
    startedAt: new Date(now + 120),
    input: { query: "AI agent observability benefits", topK: 4 },
    provider: "demo-vector-store",
  });

  client.endSpan(retrieval, {
    endedAt: new Date(now + 720),
    latencyMs: 600,
    output: {
      documents: [
        { id: "doc-latency", score: 0.94 },
        { id: "doc-failures", score: 0.89 },
      ],
    },
    inputTokens: 18,
    outputTokens: 42,
    estimatedCost: "0.0008",
  });

  const generation = client.startSpan(trace, {
    type: "llm_call",
    name: "compose-answer",
    parentSpanId: root.id,
    startedAt: new Date(now + 760),
    input: { prompt: "Synthesize a concise answer from retrieved context." },
    provider: "demo-llm",
    model: "demo-model-v1",
  });

  client.endSpan(generation, {
    endedAt: new Date(now + 2_180),
    latencyMs: 1_420,
    output: {
      answer:
        "Observability makes agent latency, decisions, tool use, and failures explainable.",
    },
    inputTokens: 380,
    outputTokens: 126,
    estimatedCost: "0.0126",
  });
  client.endSpan(root, {
    endedAt: new Date(now + SUCCESS_DURATION_MS),
    latencyMs: SUCCESS_DURATION_MS,
    output: { completed: true, answerReady: true },
  });

  const result = await client.endTrace(trace, {
    endedAt: new Date(now + SUCCESS_DURATION_MS),
    durationMs: SUCCESS_DURATION_MS,
  });
  return { ...result, status: "success" };
}

async function runFailedToolAgent(client, now = Date.now()) {
  const trace = client.startTrace({
    agentName: "demo-support-agent",
    name: "Demo: failed ticket lookup",
    startedAt: new Date(now),
    metadata: { demo: true, scenario: "failure", environment: "local" },
  });
  const root = client.startSpan(trace, {
    type: "agent",
    name: "support-workflow",
    startedAt: new Date(now),
    input: { ticketId: "DEMO-404" },
  });
  const tool = client.startSpan(trace, {
    type: "tool_call",
    name: "fetch-support-ticket",
    parentSpanId: root.id,
    startedAt: new Date(now + 90),
    input: { ticketId: "DEMO-404", includeHistory: true },
    provider: "demo-helpdesk",
  });

  client.endSpan(tool, {
    status: "failed",
    endedAt: new Date(now + 1_050),
    latencyMs: 960,
    output: { found: false, retryable: true },
    inputTokens: 24,
    outputTokens: 4,
    estimatedCost: "0.0003",
    errorType: "ToolTimeoutError",
    errorMessage: "The demo helpdesk tool timed out",
  });
  client.endSpan(root, {
    status: "failed",
    endedAt: new Date(now + FAILURE_DURATION_MS),
    latencyMs: FAILURE_DURATION_MS,
    output: { completed: false },
    errorType: "AgentExecutionError",
    errorMessage: "The ticket lookup could not be completed",
  });

  const result = await client.endTrace(trace, {
    status: "failed",
    endedAt: new Date(now + FAILURE_DURATION_MS),
    durationMs: FAILURE_DURATION_MS,
    errorType: "AgentExecutionError",
    errorMessage: "The ticket lookup could not be completed",
  });
  return { ...result, status: "failed" };
}

module.exports = {
  FAILURE_DURATION_MS,
  SUCCESS_DURATION_MS,
  runFailedToolAgent,
  runSuccessfulResearchAgent,
};
