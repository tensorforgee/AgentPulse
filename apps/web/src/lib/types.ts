export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type BillingPlan = "free" | "pro";
export type SubscriptionStatus =
  "none" | "trialing" | "active" | "past_due" | "canceled";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: BillingPlan;
  subscriptionStatus: SubscriptionStatus;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
  user: Pick<User, "id" | "email" | "displayName">;
}

export interface OrganizationInvite {
  id: string;
  organizationId: string;
  email: string;
  role: "admin" | "member" | "viewer";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: Pick<User, "id" | "email" | "displayName">;
}

export interface BillingSummary {
  organizationId: string;
  plan: BillingPlan;
  subscriptionStatus: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  period: { startedAt: string; endsAt: string };
  usage: { projects: number; members: number; traces: number };
  entitlements: {
    projectLimit: number | null;
    organizationMemberLimit: number | null;
    monthlyTraceLimit: number | null;
    traceRetentionDays: number | null;
  };
  stripe: {
    checkoutAvailable: boolean;
    webhookConfigured: boolean;
    portalAvailable: boolean;
  };
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

export interface TraceMetrics {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  errorRate: number;
  averageLatency: number | null;
  totalTokens: number;
  totalCost: string;
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

export interface AlertEvent {
  id: string;
  projectId: string;
  alertRuleId: string | null;
  traceId: string;
  ruleName: string;
  ruleType: "error_rate" | "latency" | "cost";
  threshold: string;
  observedValue: string;
  windowStartedAt: string;
  windowEndedAt: string;
  deliveryStatus: "pending" | "not_configured" | "delivered" | "failed";
  deliveryAttemptedAt: string | null;
  createdAt: string;
}

export interface RcaResult {
  status: "complete" | "unavailable" | "provider_error";
  providerConfigured: boolean;
  explanation: string;
  likelyFailingSpan: {
    id: string;
    name: string;
    type: string;
    errorType: string | null;
    errorMessage: string | null;
  } | null;
}
