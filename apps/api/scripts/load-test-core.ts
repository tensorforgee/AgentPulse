import { randomUUID } from 'node:crypto';

export type LoadEndpoint =
  | 'health_live'
  | 'health_ready'
  | 'ingest'
  | 'trace_detail'
  | 'trace_list'
  | 'trace_metrics';

export interface LoadCredentials {
  accessToken: string;
  apiKey: string;
  projectId: string;
}

export interface LoadTestConfig extends LoadCredentials {
  baseUrl: string;
  concurrency: number;
  durationSeconds: number;
  maxErrorRatePercent: number;
  requestTimeoutMs: number;
  weights: Record<LoadEndpoint, number>;
}

interface RequestSample {
  durationMs: number;
  endpoint: LoadEndpoint;
  status: number | 'network_error';
  success: boolean;
}

export interface LoadMetricSummary {
  count: number;
  errorRatePercent: number;
  errors: number;
  latencyMs: {
    p50: number;
    p95: number;
    p99: number;
  };
  statusCounts: Record<string, number>;
  throughputPerSecond: number;
}

export interface LoadTestReport {
  configuration: {
    baseUrl: string;
    concurrency: number;
    durationSeconds: number;
    requestTimeoutMs: number;
    weights: Record<LoadEndpoint, number>;
  };
  endpoints: Partial<Record<LoadEndpoint, LoadMetricSummary>>;
  overall: LoadMetricSummary;
  passed: boolean;
}

const ENDPOINTS: LoadEndpoint[] = [
  'ingest',
  'trace_list',
  'trace_metrics',
  'trace_detail',
  'health_live',
  'health_ready',
];

const EXPECTED_STATUS: Record<LoadEndpoint, number> = {
  health_live: 200,
  health_ready: 200,
  ingest: 202,
  trace_detail: 200,
  trace_list: 200,
  trace_metrics: 200,
};

export function loadConfigFromEnvironment(
  credentials?: LoadCredentials,
): LoadTestConfig {
  return {
    accessToken:
      credentials?.accessToken ?? requiredEnvironment('LOAD_ACCESS_TOKEN'),
    apiKey: credentials?.apiKey ?? requiredEnvironment('LOAD_API_KEY'),
    projectId: credentials?.projectId ?? requiredEnvironment('LOAD_PROJECT_ID'),
    baseUrl: normalizedBaseUrl(
      process.env.LOAD_BASE_URL ?? 'http://localhost:5000',
    ),
    concurrency: integerEnvironment('LOAD_CONCURRENCY', 10, 1, 500),
    durationSeconds: integerEnvironment('LOAD_DURATION_SECONDS', 15, 1, 3600),
    requestTimeoutMs: integerEnvironment(
      'LOAD_REQUEST_TIMEOUT_MS',
      10_000,
      100,
      120_000,
    ),
    maxErrorRatePercent: numberEnvironment(
      'LOAD_MAX_ERROR_RATE_PERCENT',
      1,
      0,
      100,
    ),
    weights: {
      ingest: integerEnvironment('LOAD_WEIGHT_INGEST', 3, 0, 1000),
      trace_list: integerEnvironment('LOAD_WEIGHT_TRACE_LIST', 2, 0, 1000),
      trace_metrics: integerEnvironment(
        'LOAD_WEIGHT_TRACE_METRICS',
        1,
        0,
        1000,
      ),
      trace_detail: integerEnvironment('LOAD_WEIGHT_TRACE_DETAIL', 2, 0, 1000),
      health_live: integerEnvironment('LOAD_WEIGHT_HEALTH_LIVE', 1, 0, 1000),
      health_ready: integerEnvironment('LOAD_WEIGHT_HEALTH_READY', 1, 0, 1000),
    },
  };
}

export async function runLoadTest(
  config: LoadTestConfig,
): Promise<LoadTestReport> {
  const schedule = weightedSchedule(config.weights);
  const detailTraceId = randomUUID();
  await warmup(config, detailTraceId);

  const samples: RequestSample[] = [];
  const startedAt = performance.now();
  const deadline = startedAt + config.durationSeconds * 1000;
  let nextRequest = 0;

  const workers = Array.from({ length: config.concurrency }, async () => {
    while (performance.now() < deadline) {
      const endpoint = schedule[nextRequest % schedule.length];
      nextRequest += 1;
      samples.push(await executeRequest(config, endpoint, detailTraceId));
    }
  });
  await Promise.all(workers);

  const elapsedSeconds = Math.max(
    0.001,
    (performance.now() - startedAt) / 1000,
  );
  const overall = summarizeSamples(samples, elapsedSeconds);
  const endpoints: Partial<Record<LoadEndpoint, LoadMetricSummary>> = {};
  for (const endpoint of ENDPOINTS) {
    const endpointSamples = samples.filter(
      (sample) => sample.endpoint === endpoint,
    );
    if (endpointSamples.length) {
      endpoints[endpoint] = summarizeSamples(endpointSamples, elapsedSeconds);
    }
  }

  return {
    configuration: {
      baseUrl: config.baseUrl,
      concurrency: config.concurrency,
      durationSeconds: config.durationSeconds,
      requestTimeoutMs: config.requestTimeoutMs,
      weights: config.weights,
    },
    overall,
    endpoints,
    passed: overall.errorRatePercent <= config.maxErrorRatePercent,
  };
}

export function summarizeSamples(
  samples: RequestSample[],
  elapsedSeconds: number,
): LoadMetricSummary {
  const durations = samples
    .map(({ durationMs }) => durationMs)
    .sort((left, right) => left - right);
  const errors = samples.filter(({ success }) => !success).length;
  const statusCounts: Record<string, number> = {};
  for (const { status } of samples) {
    const key = String(status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  return {
    count: samples.length,
    errors,
    errorRatePercent: roundedPercentage(errors, samples.length),
    throughputPerSecond: round(
      samples.length / Math.max(0.001, elapsedSeconds),
    ),
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
    },
    statusCounts,
  };
}

export function representativeTrace(traceId: string = randomUUID()) {
  const rootSpanId = randomUUID();
  const llmSpanId = randomUUID();
  const toolSpanId = randomUUID();
  const retrievalSpanId = randomUUID();
  const startedAt = new Date();
  const endedAt = new Date(startedAt.getTime() + 850);

  return {
    id: traceId,
    agentName: 'load-test-agent',
    name: 'Representative support workflow',
    status: 'success',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: 850,
    inputTokens: 140,
    outputTokens: 60,
    totalTokens: 200,
    totalCost: '0.0042',
    metadata: { environment: 'load-test', version: 1 },
    spans: [
      {
        id: rootSpanId,
        traceId,
        type: 'agent',
        name: 'support-agent-run',
        status: 'success',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        latencyMs: 850,
        input: { ticketType: 'billing' },
        output: { resolved: true },
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: '0',
      },
      {
        id: llmSpanId,
        traceId,
        parentSpanId: rootSpanId,
        type: 'llm_call',
        name: 'classify-request',
        status: 'success',
        startedAt: new Date(startedAt.getTime() + 50).toISOString(),
        endedAt: new Date(startedAt.getTime() + 400).toISOString(),
        latencyMs: 350,
        input: { promptKind: 'classification' },
        output: { category: 'billing' },
        inputTokens: 100,
        outputTokens: 40,
        estimatedCost: '0.003',
        provider: 'load-test',
        model: 'representative-model',
      },
      {
        id: toolSpanId,
        traceId,
        parentSpanId: llmSpanId,
        type: 'tool_call',
        name: 'lookup-account',
        status: 'success',
        startedAt: new Date(startedAt.getTime() + 410).toISOString(),
        endedAt: new Date(startedAt.getTime() + 610).toISOString(),
        latencyMs: 200,
        input: { lookup: 'account-summary' },
        output: { accountFound: true },
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: '0',
      },
      {
        id: retrievalSpanId,
        traceId,
        parentSpanId: rootSpanId,
        type: 'retrieval',
        name: 'retrieve-policy',
        status: 'success',
        startedAt: new Date(startedAt.getTime() + 620).toISOString(),
        endedAt: new Date(startedAt.getTime() + 820).toISOString(),
        latencyMs: 200,
        input: { collection: 'billing-policies' },
        output: { documents: 3 },
        inputTokens: 40,
        outputTokens: 20,
        estimatedCost: '0.0012',
      },
    ],
  };
}

async function warmup(config: LoadTestConfig, traceId: string): Promise<void> {
  const checks: Array<[LoadEndpoint, string, RequestInit]> = [
    ['health_live', '/health/live', {}],
    ['health_ready', '/health/ready', {}],
    [
      'ingest',
      '/v1/ingest',
      {
        method: 'POST',
        headers: requestHeaders(config.apiKey),
        body: JSON.stringify(representativeTrace(traceId)),
      },
    ],
    [
      'trace_detail',
      `/traces/${traceId}`,
      { headers: requestHeaders(config.accessToken) },
    ],
  ];

  for (const [endpoint, path, init] of checks) {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    await response.arrayBuffer();
    if (response.status !== EXPECTED_STATUS[endpoint]) {
      throw new Error(
        `Load-test warmup failed for ${endpoint} with HTTP ${response.status}`,
      );
    }
  }
}

async function executeRequest(
  config: LoadTestConfig,
  endpoint: LoadEndpoint,
  detailTraceId: string,
): Promise<RequestSample> {
  const startedAt = performance.now();
  try {
    const { path, init } = requestFor(config, endpoint, detailTraceId);
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    await response.arrayBuffer();
    return {
      endpoint,
      durationMs: performance.now() - startedAt,
      status: response.status,
      success: response.status === EXPECTED_STATUS[endpoint],
    };
  } catch {
    return {
      endpoint,
      durationMs: performance.now() - startedAt,
      status: 'network_error',
      success: false,
    };
  }
}

function requestFor(
  config: LoadTestConfig,
  endpoint: LoadEndpoint,
  detailTraceId: string,
): { path: string; init: RequestInit } {
  switch (endpoint) {
    case 'ingest':
      return {
        path: '/v1/ingest',
        init: {
          method: 'POST',
          headers: requestHeaders(config.apiKey),
          body: JSON.stringify(representativeTrace()),
        },
      };
    case 'trace_list':
      return {
        path: `/projects/${config.projectId}/traces?page=1&pageSize=20`,
        init: { headers: requestHeaders(config.accessToken) },
      };
    case 'trace_metrics':
      return {
        path: `/projects/${config.projectId}/traces/metrics`,
        init: { headers: requestHeaders(config.accessToken) },
      };
    case 'trace_detail':
      return {
        path: `/traces/${detailTraceId}`,
        init: { headers: requestHeaders(config.accessToken) },
      };
    case 'health_live':
      return { path: '/health/live', init: {} };
    case 'health_ready':
      return { path: '/health/ready', init: {} };
  }
}

function requestHeaders(credential: string): Record<string, string> {
  return {
    authorization: `Bearer ${credential}`,
    'content-type': 'application/json',
  };
}

function weightedSchedule(
  weights: Record<LoadEndpoint, number>,
): LoadEndpoint[] {
  const schedule = ENDPOINTS.flatMap((endpoint) =>
    Array.from({ length: weights[endpoint] }, () => endpoint),
  );
  if (!schedule.length) {
    throw new Error(
      'At least one LOAD_WEIGHT_* value must be greater than zero',
    );
  }
  return schedule;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (!sortedValues.length) {
    return 0;
  }
  const index = Math.max(
    0,
    Math.ceil(percentileValue * sortedValues.length) - 1,
  );
  return round(sortedValues[index]);
}

function roundedPercentage(value: number, total: number): number {
  return total ? round((value / total) * 100) : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function integerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function numberEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a number from ${minimum} to ${maximum}`);
  }
  return value;
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('LOAD_BASE_URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('LOAD_BASE_URL must not contain credentials');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('LOAD_BASE_URL must be an HTTP or HTTPS origin');
  }
  return url.origin;
}
