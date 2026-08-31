import {
  AgentPulse,
  type AgentPulseTrace,
} from "./sdk";

export interface OpenAICompatibleChatRequest {
  readonly model: string;
  readonly messages?: readonly unknown[];
  readonly stream?: boolean;
}

export interface OpenAICompatibleChatCompletion {
  readonly id?: unknown;
  readonly model?: unknown;
  readonly choices?: readonly unknown[];
  readonly usage?: unknown;
}

export interface TraceOpenAIChatCompletionOptions {
  readonly name?: string;
  readonly parentSpanId?: string;
  readonly provider?: string;
}

/**
 * Records one completed, non-streaming OpenAI-compatible chat completion as an
 * AgentPulse LLM span. The provider callback is invoked exactly once and its
 * result or error is preserved.
 */
export async function traceOpenAIChatCompletion<
  TResponse extends OpenAICompatibleChatCompletion,
>(
  client: AgentPulse,
  trace: AgentPulseTrace,
  request: OpenAICompatibleChatRequest,
  createCompletion: () => Promise<TResponse>,
  options: TraceOpenAIChatCompletionOptions = {},
): Promise<TResponse> {
  const startedAt = new Date();
  const provider = options.provider ?? "openai-compatible";
  const span = client.startSpan(trace, {
    type: "llm_call",
    name: options.name ?? "chat.completions.create",
    parentSpanId: options.parentSpanId,
    startedAt,
    input: {
      messageCount: request.messages?.length ?? 0,
      stream: request.stream ?? false,
    },
    provider,
    model: request.model,
    attributes: { integration: "openai-compatible" },
  });

  let response: TResponse;
  try {
    response = await createCompletion();
  } catch (error) {
    try {
      client.endSpan(span, {
        status: "failed",
        endedAt: new Date(),
        estimatedCost: "0",
        errorType: errorType(error),
        errorMessage: errorMessage(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    } catch {
      // A telemetry lifecycle error must not replace the provider error.
    }
    throw error;
  }

  const usage = usageFrom(response);
  const responseModel = nonEmptyString(response.model) ?? request.model;
  const responseId = nonEmptyString(response.id);
  const finishReasons = finishReasonsFrom(response.choices);

  client.endSpan(span, {
    endedAt: new Date(),
    output: {
      choiceCount: response.choices?.length ?? 0,
      ...(responseId ? { responseId } : {}),
      ...(finishReasons.length > 0 ? { finishReasons } : {}),
    },
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCost: usage.estimatedCost,
    provider,
    model: responseModel,
  });

  return response;
}

function usageFrom(response: OpenAICompatibleChatCompletion): {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string;
} {
  const usage = record(response.usage);
  const responseRecord = record(response);
  return {
    inputTokens:
      nonNegativeInteger(usage?.prompt_tokens) ??
      nonNegativeInteger(usage?.input_tokens) ??
      0,
    outputTokens:
      nonNegativeInteger(usage?.completion_tokens) ??
      nonNegativeInteger(usage?.output_tokens) ??
      0,
    estimatedCost:
      decimalString(usage?.total_cost) ??
      decimalString(usage?.cost) ??
      decimalString(responseRecord?.cost) ??
      "0",
  };
}

function finishReasonsFrom(choices: readonly unknown[] | undefined): string[] {
  if (!choices) {
    return [];
  }

  return choices
    .map((choice) => nonEmptyString(record(choice)?.finish_reason))
    .filter((reason): reason is string => reason !== undefined);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function decimalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/.test(value)
      ? value
      : undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  const normalized = value.toFixed(8).replace(/\.?0+$/, "");
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/.test(normalized)
    ? normalized
    : undefined;
}

function errorType(error: unknown): string {
  return error instanceof Error && error.name
    ? error.name
    : "OpenAICompatibleProviderError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "OpenAI-compatible provider request failed";
}
