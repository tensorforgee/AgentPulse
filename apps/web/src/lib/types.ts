export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyMetadata {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKeyMetadata {
  key: string;
}

export type TelemetryStatus = "running" | "success" | "failed";

export interface TraceListItem {
  id: string;
  projectId: string;
  agentName: string;
  name: string | null;
  status: TelemetryStatus;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: string;
  metadata: unknown;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface TracePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface TraceListResponse {
  data: TraceListItem[];
  pagination: TracePagination;
}

export interface SpanDetail {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  type: "llm_call" | "tool_call" | "retrieval" | "agent" | "custom";
  name: string;
  status: TelemetryStatus;
  startedAt: string;
  endedAt: string | null;
  latencyMs: number | null;
  input: unknown;
  output: unknown;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string;
  attributes: unknown;
  errorType: string | null;
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: string;
}

export interface TraceDetail extends TraceListItem {
  spans: SpanDetail[];
}
