import { AgentPulse } from "@agentpulse/sdk";

const SUCCESS_DURATION_MS = 260;
const FAILURE_DURATION_MS = 140;

const KNOWLEDGE_BASE = [
  {
    id: "api-key-rotation",
    title: "Rotate a project API key",
    content:
      "Create a replacement key, update the agent environment, verify ingestion, then revoke the old key.",
    terms: ["api", "key", "rotate", "revoke", "replacement"],
  },
  {
    id: "missing-traces",
    title: "Troubleshoot missing traces",
    content:
      "Confirm the API base URL and project key, then check that every span ends before its trace is sent.",
    terms: ["missing", "trace", "span", "ingestion", "project"],
  },
] as const;

export interface SupportRequest {
  readonly requestId: string;
  readonly customerId: string;
  readonly question: string;
  readonly simulateAccountFailure?: boolean;
}

export interface SupportRunResult {
  readonly status: "success" | "failed";
  readonly traceId: string;
  readonly spansProcessed: number;
}

export async function runSupportWorkflow(
  client: AgentPulse,
  request: SupportRequest,
  startedAt = Date.now(),
): Promise<SupportRunResult> {
  const trace = client.startTrace({
    agentName: "support-rag-agent",
    name: "Resolve customer support question",
    startedAt: new Date(startedAt),
    metadata: {
      example: "support-rag-agent",
      workflow: "retrieval-augmented-support",
      requestId: request.requestId,
      channel: "cli",
      simulatedFailure: request.simulateAccountFailure ?? false,
    },
  });
  const root = client.startSpan(trace, {
    type: "agent",
    name: "support-workflow",
    startedAt: new Date(startedAt),
    input: {
      requestId: request.requestId,
      customerId: request.customerId,
      question: request.question,
    },
    attributes: { workflowVersion: "1" },
  });

  const retrieval = client.startSpan(trace, {
    type: "retrieval",
    name: "search-support-knowledge-base",
    parentSpanId: root.id,
    startedAt: new Date(startedAt + 15),
    input: { query: request.question, topK: 2 },
    provider: "local-knowledge-base",
    attributes: { documentCount: KNOWLEDGE_BASE.length },
  });
  const matches = searchKnowledgeBase(request.question);
  client.endSpan(retrieval, {
    endedAt: new Date(startedAt + 50),
    latencyMs: 35,
    output: {
      matches: matches.map(({ id, title, score }) => ({ id, title, score })),
    },
    inputTokens: 12,
    outputTokens: 64,
    estimatedCost: "0",
  });

  const accountLookup = client.startSpan(trace, {
    type: "tool_call",
    name: "load-customer-plan",
    parentSpanId: root.id,
    startedAt: new Date(startedAt + 60),
    input: { customerId: request.customerId },
    provider: "local-crm",
  });

  if (request.simulateAccountFailure) {
    client.endSpan(accountLookup, {
      status: "failed",
      endedAt: new Date(startedAt + 125),
      latencyMs: 65,
      output: { customerFound: false, retryable: false },
      inputTokens: 8,
      outputTokens: 0,
      estimatedCost: "0.0001",
      errorType: "CustomerNotFoundError",
      errorMessage: "The local CRM could not find the requested customer",
    });
    client.endSpan(root, {
      status: "failed",
      endedAt: new Date(startedAt + FAILURE_DURATION_MS),
      latencyMs: FAILURE_DURATION_MS,
      output: { answered: false, reason: "customer context unavailable" },
      errorType: "SupportWorkflowError",
      errorMessage: "Customer context is required before answering",
    });
    const response = await client.endTrace(trace, {
      status: "failed",
      endedAt: new Date(startedAt + FAILURE_DURATION_MS),
      durationMs: FAILURE_DURATION_MS,
      errorType: "SupportWorkflowError",
      errorMessage: "Customer context is required before answering",
    });
    return { ...response, status: "failed" };
  }

  client.endSpan(accountLookup, {
    endedAt: new Date(startedAt + 95),
    latencyMs: 35,
    output: { customerFound: true, plan: "developer", region: "us-east" },
    inputTokens: 8,
    outputTokens: 12,
    estimatedCost: "0.0001",
  });

  const generation = client.startSpan(trace, {
    type: "llm_call",
    name: "draft-grounded-answer",
    parentSpanId: root.id,
    startedAt: new Date(startedAt + 100),
    input: {
      question: request.question,
      contextDocumentIds: matches.map((match) => match.id),
      customerPlan: "developer",
    },
    provider: "local-deterministic",
    model: "support-template-v1",
    attributes: { temperature: 0, grounded: true },
  });
  const answer = groundedAnswer(matches);
  client.endSpan(generation, {
    endedAt: new Date(startedAt + 245),
    latencyMs: 145,
    output: { answer, citations: matches.map((match) => match.id) },
    inputTokens: 210,
    outputTokens: 72,
    estimatedCost: "0.0014",
  });
  client.endSpan(root, {
    endedAt: new Date(startedAt + SUCCESS_DURATION_MS),
    latencyMs: SUCCESS_DURATION_MS,
    output: { answered: true, answer },
  });

  const response = await client.endTrace(trace, {
    endedAt: new Date(startedAt + SUCCESS_DURATION_MS),
    durationMs: SUCCESS_DURATION_MS,
  });
  return { ...response, status: "success" };
}

function searchKnowledgeBase(query: string) {
  const queryTerms = new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return KNOWLEDGE_BASE.map((document) => ({
    ...document,
    score: document.terms.filter((term) => queryTerms.has(term)).length,
  }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
}

function groundedAnswer(matches: ReturnType<typeof searchKnowledgeBase>) {
  if (matches.length === 0) {
    return "I could not find grounded support guidance for that question.";
  }
  return matches[0].content;
}

export { FAILURE_DURATION_MS, SUCCESS_DURATION_MS };
