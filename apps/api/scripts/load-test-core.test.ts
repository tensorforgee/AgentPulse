import assert from 'node:assert/strict';
import test from 'node:test';
import {
  representativeTrace,
  summarizeSamples,
  type LoadEndpoint,
} from './load-test-core';

void test('summarizes throughput, percentiles, statuses, and errors', () => {
  const endpoint: LoadEndpoint = 'ingest';
  const summary = summarizeSamples(
    [
      { endpoint, durationMs: 10, status: 202, success: true },
      { endpoint, durationMs: 20, status: 202, success: true },
      { endpoint, durationMs: 30, status: 500, success: false },
      { endpoint, durationMs: 40, status: 202, success: true },
    ],
    2,
  );

  assert.deepEqual(summary, {
    count: 4,
    errors: 1,
    errorRatePercent: 25,
    throughputPerSecond: 2,
    latencyMs: { p50: 20, p95: 40, p99: 40 },
    statusCounts: { 202: 3, 500: 1 },
  });
});

void test('creates representative nested telemetry without a project ID', () => {
  const trace = representativeTrace('5e8adf17-39c6-40c4-8231-3073fcc2497a');
  const types = trace.spans.map(({ type }) => type);

  assert.equal('projectId' in trace, false);
  assert.deepEqual(types, ['agent', 'llm_call', 'tool_call', 'retrieval']);
  assert.equal(trace.spans[1].parentSpanId, trace.spans[0].id);
  assert.equal(trace.spans[2].parentSpanId, trace.spans[1].id);
  assert.equal(trace.totalTokens, 200);
  assert.equal(trace.totalCost, '0.0042');
});
