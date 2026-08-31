import {
  assertTraceWithSpansContract,
  SPAN_TYPES,
  type DecimalString,
  type JsonObject,
  type JsonValue,
  type SpanContract,
  type SpanType,
  TelemetryValidationError,
  type TraceWithSpansContract,
} from "@agentpulse/shared";

export type {
  DecimalString,
  JsonObject,
  JsonValue,
  SpanType,
} from "@agentpulse/shared";

const AUTHENTICATED_PROJECT_PLACEHOLDER =
  "00000000-0000-0000-0000-000000000000";

export type FinishedStatus = "success" | "failed";
export type TimestampInput = string | Date;
const FINISHED_STATUSES = ["success", "failed"] as const;
const TIMESTAMP_TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 100;
const MAX_RETRIES = 5;
const MAX_RETRY_DELAY_MS = 10_000;

export interface AgentPulseOptions {
  readonly requestTimeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
}

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
  readonly attempts: number;
  readonly retryable = true;

  constructor(attempts = 1) {
    super(
      `Unable to reach the AgentPulse ingestion endpoint after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
    );
    this.name = "AgentPulseRequestError";
    this.attempts = attempts;
  }
}

export class AgentPulseIngestError extends AgentPulseError {
  readonly status: number;
  readonly attempts: number;
  readonly retryable: boolean;

  constructor(status: number, attempts = 1) {
    super(
      `AgentPulse ingestion failed with HTTP status ${status} after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
    );
    this.name = "AgentPulseIngestError";
    this.status = status;
    this.attempts = attempts;
    this.retryable = isRetryableStatus(status);
  }
}

export class AgentPulse {
  readonly #apiKey: string;
  readonly #ingestUrl: string;
  readonly #requestTimeoutMs: number;
  readonly #maxRetries: number;
  readonly #retryDelayMs: number;
  readonly #traces = new WeakMap<AgentPulseTrace, TraceState>();
  readonly #spans = new WeakMap<AgentPulseSpan, SpanState>();

  constructor(apiKey: string, baseUrl: string, options: AgentPulseOptions = {}) {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new AgentPulseValidationError("apiKey must be a non-empty string");
    }
    requireOptionsObject(options, "AgentPulse options");

    this.#apiKey = apiKey;
    this.#ingestUrl = ingestionUrl(baseUrl);
    this.#requestTimeoutMs = boundedInteger(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1,
      Number.MAX_SAFE_INTEGER,
      "requestTimeoutMs",
    );
    this.#maxRetries = boundedInteger(
      options.maxRetries,
      DEFAULT_MAX_RETRIES,
      0,
      MAX_RETRIES,
      "maxRetries",
    );
    this.#retryDelayMs = boundedInteger(
      options.retryDelayMs,
      DEFAULT_RETRY_DELAY_MS,
      0,
      MAX_RETRY_DELAY_MS,
      "retryDelayMs",
    );
  }

  startTrace(options: StartTraceOptions): AgentPulseTrace {
    if (!options || typeof options !== "object") {
      throw new AgentPulseValidationError("Trace options are required");
    }
    requireNonEmptyString(options.agentName, "agentName");
    optionalNonEmptyString(options.name, "name");

    const startedAt = timestamp(options.startedAt, "startedAt");
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
    if (!options || typeof options !== "object") {
      throw new AgentPulseValidationError("Span options are required");
    }
    if (!(SPAN_TYPES as readonly unknown[]).includes(options.type)) {
      throw new AgentPulseValidationError(
        `type must be one of ${SPAN_TYPES.join(", ")}`,
      );
    }
    requireNonEmptyString(options.name, "name");

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

    const startedAt = timestamp(options.startedAt, "startedAt");
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
    requireOptionsObject(options, "End span options");
    optionalFinishedStatus(options.status);

    const endedAt = timestamp(options.endedAt, "endedAt");
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

  async withSpan<T>(
    trace: AgentPulseTrace,
    options: StartSpanOptions,
    operation: (span: AgentPulseSpan) => T | Promise<T>,
    endOptions: EndSpanOptions = {},
  ): Promise<T> {
    if (typeof operation !== "function") {
      throw new AgentPulseValidationError("Span operation must be a function");
    }
    const span = this.startSpan(trace, options);

    let result: T;
    try {
      result = await operation(span);
    } catch (error) {
      if (!this.#spans.get(span)?.completed) {
        try {
          this.endSpan(span, spanFailureOptions(error));
        } catch {
          // Preserve the operation error if telemetry lifecycle cleanup fails.
        }
      }
      throw error;
    }

    if (!this.#spans.get(span)?.completed) {
      this.endSpan(span, endOptions);
    }
    return result;
  }

  async withTrace<T>(
    options: StartTraceOptions,
    operation: (trace: AgentPulseTrace) => T | Promise<T>,
    endOptions: EndTraceOptions = {},
  ): Promise<T> {
    if (typeof operation !== "function") {
      throw new AgentPulseValidationError("Trace operation must be a function");
    }
    const trace = this.startTrace(options);
    const state = this.#requireTrace(trace);

    let result: T;
    try {
      result = await operation(trace);
    } catch (error) {
      const spanFailure = spanFailureOptions(error);
      for (const span of state.spans) {
        if (!span.completed) {
          try {
            this.endSpan(span.handle, spanFailure);
          } catch {
            // Preserve the operation error if span cleanup fails.
          }
        }
      }
      if (!state.completed) {
        try {
          await this.endTrace(trace, traceFailureOptions(error));
        } catch {
          // Preserve the operation error if telemetry delivery fails.
        }
      }
      throw error;
    }

    if (!state.completed) {
      await this.endTrace(trace, endOptions);
    }
    return result;
  }

  async endTrace(
    trace: AgentPulseTrace,
    options: EndTraceOptions = {},
  ): Promise<IngestResponse> {
    const state = this.#requireTrace(trace);
    requireOptionsObject(options, "End trace options");
    optionalFinishedStatus(options.status);

    if (!state.completed) {
      if (state.spans.some((span) => !span.completed)) {
        throw new AgentPulseValidationError(
          "All spans must be ended before ending the trace",
        );
      }

      const endedAt = timestamp(options.endedAt, "endedAt");
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
    const requestBody = JSON.stringify(payload);
    const maximumAttempts = this.#maxRetries + 1;
    let response: Response | undefined;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        response = await fetch(this.#ingestUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.#apiKey}`,
            "content-type": "application/json",
          },
          body: requestBody,
          signal: AbortSignal.timeout(this.#requestTimeoutMs),
        });
      } catch {
        if (attempt < maximumAttempts) {
          await retryDelay(this.#retryDelayMs, attempt);
          continue;
        }
        throw new AgentPulseRequestError(attempt);
      }

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < maximumAttempts) {
          await response.body?.cancel().catch(() => undefined);
          await retryDelay(this.#retryDelayMs, attempt);
          continue;
        }
        throw new AgentPulseIngestError(response.status, attempt);
      }
      break;
    }

    if (!response?.ok) {
      throw new AgentPulseRequestError(maximumAttempts);
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
  if (parsed.username || parsed.password) {
    throw new AgentPulseValidationError(
      "baseUrl must not include embedded credentials",
    );
  }
  if (parsed.search || parsed.hash) {
    throw new AgentPulseValidationError(
      "baseUrl must not include a query string or fragment",
    );
  }
  if (/\/v1\/ingest\/?$/.test(parsed.pathname)) {
    throw new AgentPulseValidationError(
      "baseUrl must be the AgentPulse API origin without /v1/ingest",
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

function timestamp(value: TimestampInput | undefined, field: string): string {
  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      throw new AgentPulseValidationError(`${field} must be a valid date`);
    }
  }
  if (value === undefined) {
    return new Date().toISOString();
  }
  if (
    typeof value !== "string" ||
    !TIMESTAMP_TIMEZONE_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new AgentPulseValidationError(
      `${field} must be an ISO 8601 timestamp with a timezone`,
    );
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AgentPulseValidationError(`${field} must be a non-empty string`);
  }
}

function optionalNonEmptyString(value: unknown, field: string): void {
  if (value !== undefined && value !== null) {
    requireNonEmptyString(value, field);
  }
}

function requireOptionsObject(value: unknown, field: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AgentPulseValidationError(`${field} must be an object`);
  }
}

function optionalFinishedStatus(value: unknown): void {
  if (
    value !== undefined &&
    !(FINISHED_STATUSES as readonly unknown[]).includes(value)
  ) {
    throw new AgentPulseValidationError(
      `status must be one of ${FINISHED_STATUSES.join(", ")}`,
    );
  }
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new AgentPulseValidationError(
      `${field} must be a safe integer between ${minimum} and ${maximum}`,
    );
  }
  return value as number;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function retryDelay(baseDelayMs: number, retryNumber: number): Promise<void> {
  const delayMs = Math.min(baseDelayMs * 2 ** (retryNumber - 1), MAX_RETRY_DELAY_MS);
  if (delayMs === 0) {
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function spanFailureOptions(error: unknown): EndSpanOptions {
  return {
    status: "failed",
    errorType: error instanceof Error && error.name ? error.name : "Error",
    errorMessage:
      error instanceof Error && error.message ? error.message : "Operation failed",
    errorStack: error instanceof Error ? error.stack : undefined,
  };
}

function traceFailureOptions(error: unknown): EndTraceOptions {
  return {
    status: "failed",
    errorType: error instanceof Error && error.name ? error.name : "Error",
    errorMessage:
      error instanceof Error && error.message ? error.message : "Operation failed",
  };
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
