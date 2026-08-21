import {
  assertTraceWithSpansContract,
  type DecimalString,
  type JsonObject,
  type JsonValue,
  type SpanContract,
  type SpanType,
  TelemetryValidationError,
  type TraceWithSpansContract,
} from "@agentpulse/shared";

const AUTHENTICATED_PROJECT_PLACEHOLDER =
  "00000000-0000-0000-0000-000000000000";

type FinishedStatus = "success" | "failed";
type TimestampInput = string | Date;

export type IngestPayload = Omit<TraceWithSpansContract, "projectId">;

export interface IngestResponse {
  readonly traceId: string;
  readonly spansProcessed: number;
}

export interface AgentPulseTrace {
  readonly id: string;
  readonly startedAt: string;
}

export interface AgentPulseSpan {
  readonly id: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly startedAt: string;
}

export interface StartTraceOptions {
  readonly agentName: string;
  readonly name?: string | null;
  readonly id?: string;
  readonly startedAt?: TimestampInput;
  readonly metadata?: JsonObject;
}

export interface StartSpanOptions {
  readonly type: SpanType;
  readonly name: string;
  readonly id?: string;
  readonly parentSpanId?: string;
  readonly startedAt?: TimestampInput;
  readonly input?: JsonValue;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly attributes?: JsonObject;
}

export interface EndSpanOptions {
  readonly status?: FinishedStatus;
  readonly endedAt?: TimestampInput;
  readonly latencyMs?: number | null;
  readonly input?: JsonValue;
  readonly output?: JsonValue;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCost?: DecimalString;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly attributes?: JsonObject;
  readonly errorType?: string | null;
  readonly errorMessage?: string | null;
  readonly errorStack?: string | null;
}

export interface EndTraceOptions {
  readonly status?: FinishedStatus;
  readonly endedAt?: TimestampInput;
  readonly durationMs?: number | null;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalCost?: DecimalString;
  readonly metadata?: JsonObject;
  readonly errorType?: string | null;
  readonly errorMessage?: string | null;
}

interface TraceState {
  readonly handle: AgentPulseTrace;
  readonly agentName: string;
  readonly name?: string | null;
  readonly startedAt: string;
  readonly spans: SpanState[];
  metadata?: JsonObject;
  completed?: CompletedTraceState;
}

interface CompletedTraceState {
  readonly status: FinishedStatus;
  readonly endedAt: string;
  readonly durationMs: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalCost: DecimalString;
  readonly metadata?: JsonObject;
  readonly errorType?: string | null;
  readonly errorMessage?: string | null;
}

interface SpanState {
  readonly handle: AgentPulseSpan;
  readonly trace: TraceState;
  readonly type: SpanType;
  readonly name: string;
  readonly startedAt: string;
  input?: JsonValue;
  output?: JsonValue;
  provider?: string | null;
  model?: string | null;
  attributes?: JsonObject;
  completed?: CompletedSpanState;
}

interface CompletedSpanState {
  readonly status: FinishedStatus;
  readonly endedAt: string;
  readonly latencyMs: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCost: DecimalString;
  readonly errorType?: string | null;
  readonly errorMessage?: string | null;
  readonly errorStack?: string | null;
}

export class AgentPulseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPulseError";
  }
}

export class AgentPulseValidationError extends AgentPulseError {
  constructor(message: string) {
    super(message);
    this.name = "AgentPulseValidationError";
  }
}

export class AgentPulseRequestError extends AgentPulseError {
  constructor() {
    super("Unable to reach the AgentPulse ingestion endpoint");
    this.name = "AgentPulseRequestError";
  }
}

export class AgentPulseIngestError extends AgentPulseError {
  readonly status: number;

  constructor(status: number) {
    super(`AgentPulse ingestion failed with HTTP status ${status}`);
    this.name = "AgentPulseIngestError";
    this.status = status;
  }
}

export class AgentPulse {
  readonly #apiKey: string;
  readonly #ingestUrl: string;
  readonly #traces = new WeakMap<AgentPulseTrace, TraceState>();
  readonly #spans = new WeakMap<AgentPulseSpan, SpanState>();

  constructor(apiKey: string, baseUrl: string) {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new AgentPulseValidationError("apiKey must be a non-empty string");
    }

    this.#apiKey = apiKey;
    this.#ingestUrl = ingestionUrl(baseUrl);
  }

  startTrace(options: StartTraceOptions): AgentPulseTrace {
    if (!options || typeof options.agentName !== "string") {
      throw new AgentPulseValidationError("agentName is required");
    }

    const startedAt = timestamp(options.startedAt);
    const handle = Object.freeze({
      id: options.id ?? secureUuid(),
      startedAt,
    });
    const state: TraceState = {
      handle,
      agentName: options.agentName,
      name: options.name,
      startedAt,
      spans: [],
      metadata: options.metadata,
    };

    this.#traces.set(handle, state);
    return handle;
  }

  startSpan(trace: AgentPulseTrace, options: StartSpanOptions): AgentPulseSpan {
    const traceState = this.#requireTrace(trace);
    if (traceState.completed) {
      throw new AgentPulseValidationError(
        "Cannot start a span after its trace has ended",
      );
    }

    const id = options.id ?? secureUuid();
    if (traceState.spans.some((span) => span.handle.id === id)) {
      throw new AgentPulseValidationError(
        `Span ID ${id} already exists in this trace`,
      );
    }

    if (
      options.parentSpanId &&
      !traceState.spans.some((span) => span.handle.id === options.parentSpanId)
    ) {
      throw new AgentPulseValidationError(
        "parentSpanId must reference a span in the same trace",
      );
    }

    const startedAt = timestamp(options.startedAt);
    const handle = Object.freeze({
      id,
      traceId: trace.id,
      ...(options.parentSpanId ? { parentSpanId: options.parentSpanId } : {}),
      startedAt,
    });
    const state: SpanState = {
      handle,
      trace: traceState,
      type: options.type,
      name: options.name,
      startedAt,
      input: options.input,
      provider: options.provider,
      model: options.model,
      attributes: options.attributes,
    };

    traceState.spans.push(state);
    this.#spans.set(handle, state);
    return handle;
  }

  endSpan(span: AgentPulseSpan, options: EndSpanOptions = {}): AgentPulseSpan {
    const state = this.#requireSpan(span);
    if (state.trace.completed) {
      throw new AgentPulseValidationError(
        "Cannot end a span after its trace has ended",
      );
    }
    if (state.completed) {
      throw new AgentPulseValidationError("Span has already ended");
    }

    const endedAt = timestamp(options.endedAt);
    if (Object.prototype.hasOwnProperty.call(options, "input")) {
      state.input = options.input;
    }
    if (Object.prototype.hasOwnProperty.call(options, "output")) {
      state.output = options.output;
    }
    if (Object.prototype.hasOwnProperty.call(options, "provider")) {
      state.provider = options.provider;
    }
    if (Object.prototype.hasOwnProperty.call(options, "model")) {
      state.model = options.model;
    }
    if (Object.prototype.hasOwnProperty.call(options, "attributes")) {
      state.attributes = options.attributes;
    }

    state.completed = {
      status:
        options.status ??
        (options.errorType || options.errorMessage ? "failed" : "success"),
      endedAt,
      latencyMs:
        options.latencyMs === undefined
          ? elapsedMilliseconds(state.startedAt, endedAt)
          : options.latencyMs,
      inputTokens: options.inputTokens ?? 0,
      outputTokens: options.outputTokens ?? 0,
      estimatedCost: options.estimatedCost ?? "0",
      errorType: options.errorType,
      errorMessage: options.errorMessage,
      errorStack: options.errorStack,
    };

    return span;
  }

  async endTrace(
    trace: AgentPulseTrace,
    options: EndTraceOptions = {},
  ): Promise<IngestResponse> {
    const state = this.#requireTrace(trace);

    if (!state.completed) {
      if (state.spans.some((span) => !span.completed)) {
        throw new AgentPulseValidationError(
          "All spans must be ended before ending the trace",
        );
      }

      const endedAt = timestamp(options.endedAt);
      const inputTokens =
        options.inputTokens ??
        sumNumbers(state.spans.map((span) => span.completed!.inputTokens));
      const outputTokens =
        options.outputTokens ??
        sumNumbers(state.spans.map((span) => span.completed!.outputTokens));

      state.completed = {
        status:
          options.status ??
          (options.errorType || options.errorMessage ? "failed" : "success"),
        endedAt,
        durationMs:
          options.durationMs === undefined
            ? elapsedMilliseconds(state.startedAt, endedAt)
            : options.durationMs,
        inputTokens,
        outputTokens,
        totalCost:
          options.totalCost ??
          sumDecimalStrings(
            state.spans.map((span) => span.completed!.estimatedCost),
          ),
        metadata: options.metadata ?? state.metadata,
        errorType: options.errorType,
        errorMessage: options.errorMessage,
      };
    }

    const payload = this.#serialize(state);
    validatePayload(payload);
    return this.#send(payload);
  }

  #serialize(state: TraceState): IngestPayload {
    const completed = state.completed!;
    const payload = {
      id: state.handle.id,
      agentName: state.agentName,
      name: state.name,
      status: completed.status,
      startedAt: state.startedAt,
      endedAt: completed.endedAt,
      durationMs: completed.durationMs,
      inputTokens: completed.inputTokens,
      outputTokens: completed.outputTokens,
      totalTokens: completed.inputTokens + completed.outputTokens,
      totalCost: completed.totalCost,
      metadata: completed.metadata,
      errorType: completed.errorType,
      errorMessage: completed.errorMessage,
      spans: state.spans.map((span) => this.#serializeSpan(span)),
    };

    return JSON.parse(JSON.stringify(payload)) as IngestPayload;
  }

  #serializeSpan(state: SpanState): SpanContract {
    const completed = state.completed!;
    return {
      id: state.handle.id,
      traceId: state.handle.traceId,
      parentSpanId: state.handle.parentSpanId,
      type: state.type,
      name: state.name,
      status: completed.status,
      startedAt: state.startedAt,
      endedAt: completed.endedAt,
      latencyMs: completed.latencyMs,
      input: state.input,
      output: state.output,
      inputTokens: completed.inputTokens,
      outputTokens: completed.outputTokens,
      estimatedCost: completed.estimatedCost,
      provider: state.provider,
      model: state.model,
      attributes: state.attributes,
      errorType: completed.errorType,
      errorMessage: completed.errorMessage,
      errorStack: completed.errorStack,
    };
  }

  async #send(payload: IngestPayload): Promise<IngestResponse> {
    let response: Response;
    try {
      response = await fetch(this.#ingestUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new AgentPulseRequestError();
    }

    if (!response.ok) {
      throw new AgentPulseIngestError(response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AgentPulseError(
        "AgentPulse ingestion returned an invalid JSON response",
      );
    }

    if (!isIngestResponse(body) || body.traceId !== payload.id) {
      throw new AgentPulseError(
        "AgentPulse ingestion returned an invalid response body",
      );
    }

    return body;
  }

  #requireTrace(trace: AgentPulseTrace): TraceState {
    const state = this.#traces.get(trace);
    if (!state) {
      throw new AgentPulseValidationError(
        "Trace was not created by this AgentPulse client",
      );
    }
    return state;
  }

  #requireSpan(span: AgentPulseSpan): SpanState {
    const state = this.#spans.get(span);
    if (!state) {
      throw new AgentPulseValidationError(
        "Span was not created by this AgentPulse client",
      );
    }
    return state;
  }
}

function ingestionUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AgentPulseValidationError("baseUrl must be a valid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AgentPulseValidationError("baseUrl must use HTTP or HTTPS");
  }
  if (parsed.search || parsed.hash) {
    throw new AgentPulseValidationError(
      "baseUrl must not include a query string or fragment",
    );
  }

  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/v1/ingest`;
  return parsed.toString();
}

function secureUuid(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new AgentPulseError(
      "Secure UUID generation is unavailable in this runtime",
    );
  }
  return globalThis.crypto.randomUUID();
}

function timestamp(value?: TimestampInput): string {
  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      throw new AgentPulseValidationError("Timestamp must be a valid date");
    }
  }
  return value ?? new Date().toISOString();
}

function elapsedMilliseconds(
  startedAt: string,
  endedAt: string,
): number | null {
  const elapsed = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumDecimalStrings(values: readonly DecimalString[]): DecimalString {
  const scale = 100_000_000n;
  let total = 0n;

  for (const value of values) {
    const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value);
    if (!match) {
      throw new AgentPulseValidationError(
        "Span estimatedCost must be a non-negative decimal string with up to 8 places",
      );
    }
    total += BigInt(match[1]) * scale;
    total += BigInt((match[2] ?? "").padEnd(8, "0") || "0");
  }

  const whole = total / scale;
  const fraction = (total % scale)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function validatePayload(payload: IngestPayload): void {
  try {
    assertTraceWithSpansContract({
      ...payload,
      projectId: AUTHENTICATED_PROJECT_PLACEHOLDER,
    });
  } catch (error) {
    if (error instanceof TelemetryValidationError) {
      throw new AgentPulseValidationError(error.message);
    }
    throw error;
  }
}

function isIngestResponse(value: unknown): value is IngestResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.traceId === "string" &&
    Number.isSafeInteger(candidate.spansProcessed) &&
    (candidate.spansProcessed as number) >= 0
  );
}
