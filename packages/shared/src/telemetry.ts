export const TELEMETRY_STATUSES = ["running", "success", "failed"] as const;

export const SPAN_TYPES = [
  "llm_call",
  "tool_call",
  "retrieval",
  "agent",
  "custom",
] as const;

export type TelemetryStatus = (typeof TELEMETRY_STATUSES)[number];
export type SpanType = (typeof SPAN_TYPES)[number];
export type IsoTimestamp = string;
export type DecimalString = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export interface TraceContract {
  readonly id: string;
  readonly projectId: string;
  readonly agentName: string;
  readonly name?: string | null;
  readonly status: TelemetryStatus;
  readonly startedAt: IsoTimestamp;
  readonly endedAt?: IsoTimestamp | null;
  readonly durationMs?: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly totalCost: DecimalString;
  readonly metadata?: JsonObject;
  readonly errorType?: string | null;
  readonly errorMessage?: string | null;
}

export interface SpanContract {
  readonly id: string;
  readonly traceId: string;
  readonly parentSpanId?: string | null;
  readonly type: SpanType;
  readonly name: string;
  readonly status: TelemetryStatus;
  readonly startedAt: IsoTimestamp;
  readonly endedAt?: IsoTimestamp | null;
  readonly latencyMs?: number | null;
  readonly input?: JsonValue;
  readonly output?: JsonValue;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCost: DecimalString;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly attributes?: JsonObject;
  readonly errorType?: string | null;
  readonly errorMessage?: string | null;
  readonly errorStack?: string | null;
}

export interface TraceWithSpansContract extends TraceContract {
  readonly spans: readonly SpanContract[];
}

export class TelemetryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryValidationError";
  }
}

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/;
const TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

export function assertTraceContract(
  value: unknown,
): asserts value is TraceContract {
  const trace = requireRecord(value, "trace");
  requireUuid(trace.id, "trace.id");
  requireUuid(trace.projectId, "trace.projectId");
  requireNonEmptyString(trace.agentName, "trace.agentName");
  optionalNonEmptyString(trace.name, "trace.name");
  requireTelemetryStatus(trace.status, "trace.status");
  const startedAt = requireTimestamp(trace.startedAt, "trace.startedAt");
  const endedAt = optionalTimestamp(trace.endedAt, "trace.endedAt");
  requireTimeOrder(startedAt, endedAt, "trace");
  optionalNonNegativeInteger(trace.durationMs, "trace.durationMs");
  const inputTokens = requireNonNegativeInteger(
    trace.inputTokens,
    "trace.inputTokens",
  );
  const outputTokens = requireNonNegativeInteger(
    trace.outputTokens,
    "trace.outputTokens",
  );
  const totalTokens = requireNonNegativeInteger(
    trace.totalTokens,
    "trace.totalTokens",
  );

  if (totalTokens !== inputTokens + outputTokens) {
    fail("trace.totalTokens must equal inputTokens + outputTokens");
  }

  requireDecimalString(trace.totalCost, "trace.totalCost");
  optionalJsonObject(trace.metadata, "trace.metadata");
  optionalString(trace.errorType, "trace.errorType");
  optionalString(trace.errorMessage, "trace.errorMessage");
}

export function assertSpanContract(
  value: unknown,
): asserts value is SpanContract {
  const span = requireRecord(value, "span");
  const id = requireUuid(span.id, "span.id");
  requireUuid(span.traceId, "span.traceId");
  const parentSpanId = optionalUuid(span.parentSpanId, "span.parentSpanId");

  if (parentSpanId === id) {
    fail("span.parentSpanId cannot equal span.id");
  }

  requireSpanType(span.type, "span.type");
  requireNonEmptyString(span.name, "span.name");
  requireTelemetryStatus(span.status, "span.status");
  const startedAt = requireTimestamp(span.startedAt, "span.startedAt");
  const endedAt = optionalTimestamp(span.endedAt, "span.endedAt");
  requireTimeOrder(startedAt, endedAt, "span");
  optionalNonNegativeInteger(span.latencyMs, "span.latencyMs");
  optionalJsonValue(span.input, "span.input");
  optionalJsonValue(span.output, "span.output");
  requireNonNegativeInteger(span.inputTokens, "span.inputTokens");
  requireNonNegativeInteger(span.outputTokens, "span.outputTokens");
  requireDecimalString(span.estimatedCost, "span.estimatedCost");
  optionalString(span.provider, "span.provider");
  optionalString(span.model, "span.model");
  optionalJsonObject(span.attributes, "span.attributes");
  optionalString(span.errorType, "span.errorType");
  optionalString(span.errorMessage, "span.errorMessage");
  optionalString(span.errorStack, "span.errorStack");
}

export function assertTraceWithSpansContract(
  value: unknown,
): asserts value is TraceWithSpansContract {
  assertTraceContract(value);
  const trace = value as TraceWithSpansContract;

  if (!Array.isArray(trace.spans)) {
    fail("trace.spans must be an array");
  }

  const spans = trace.spans as readonly unknown[];
  const spanById = new Map<string, SpanContract>();

  for (const candidate of spans) {
    assertSpanContract(candidate);

    if (candidate.traceId !== trace.id) {
      fail("every span.traceId must equal trace.id");
    }

    if (spanById.has(candidate.id)) {
      fail("span ids must be unique within a trace");
    }

    spanById.set(candidate.id, candidate);
  }

  for (const span of spanById.values()) {
    if (span.parentSpanId && !spanById.has(span.parentSpanId)) {
      fail("span.parentSpanId must reference a span in the same trace");
    }
  }

  rejectParentCycles(spanById);
}

function rejectParentCycles(spanById: ReadonlyMap<string, SpanContract>): void {
  for (const span of spanById.values()) {
    const visited = new Set<string>();
    let current: SpanContract | undefined = span;

    while (current?.parentSpanId) {
      if (visited.has(current.id)) {
        fail("span parent relationships cannot contain a cycle");
      }

      visited.add(current.id);
      current = spanById.get(current.parentSpanId);
    }
  }
}

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (!isJsonObject(value)) {
    fail(`${field} must be an object`);
  }

  return value;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(`${field} must be a UUID`);
  }

  return value;
}

function optionalUuid(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return requireUuid(value, field);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${field} must be a non-empty string`);
  }

  return value;
}

function optionalNonEmptyString(value: unknown, field: string): void {
  if (value !== undefined && value !== null) {
    requireNonEmptyString(value, field);
  }
}

function optionalString(value: unknown, field: string): void {
  if (value !== undefined && value !== null && typeof value !== "string") {
    fail(`${field} must be a string when provided`);
  }
}

function requireTelemetryStatus(value: unknown, field: string): void {
  if (
    typeof value !== "string" ||
    !(TELEMETRY_STATUSES as readonly string[]).includes(value)
  ) {
    fail(`${field} must be one of ${TELEMETRY_STATUSES.join(", ")}`);
  }
}

function requireSpanType(value: unknown, field: string): void {
  if (
    typeof value !== "string" ||
    !(SPAN_TYPES as readonly string[]).includes(value)
  ) {
    fail(`${field} must be one of ${SPAN_TYPES.join(", ")}`);
  }
}

function requireTimestamp(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !TIMEZONE_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${field} must be an ISO 8601 timestamp with a timezone`);
  }

  return value;
}

function optionalTimestamp(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return requireTimestamp(value, field);
}

function requireTimeOrder(
  startedAt: string,
  endedAt: string | null | undefined,
  field: string,
): void {
  if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
    fail(`${field}.endedAt cannot be before ${field}.startedAt`);
  }
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${field} must be a non-negative safe integer`);
  }

  return value as number;
}

function optionalNonNegativeInteger(value: unknown, field: string): void {
  if (value !== undefined && value !== null) {
    requireNonNegativeInteger(value, field);
  }
}

function requireDecimalString(value: unknown, field: string): void {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    fail(`${field} must be a non-negative decimal string with up to 8 places`);
  }
}

function optionalJsonObject(value: unknown, field: string): void {
  if (value !== undefined && !isJsonObject(value)) {
    fail(`${field} must be a JSON object when provided`);
  }
}

function optionalJsonValue(value: unknown, field: string): void {
  if (value !== undefined && !isJsonValue(value)) {
    fail(`${field} must be a valid JSON value when provided`);
  }
}

function isJsonObject(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

function fail(message: string): never {
  throw new TelemetryValidationError(message);
}
