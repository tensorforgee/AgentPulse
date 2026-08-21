# API load test

The dependency-free load runner uses concurrent closed-loop workers against a
weighted mix of ingestion, trace list, trace metrics, trace detail, liveness,
and readiness requests. It reports throughput, error rate, HTTP status counts,
and p50/p95/p99 latency overall and per endpoint.

Use a dedicated non-production project. Credentials are read from the
environment and are never included in the report:

```text
LOAD_BASE_URL=http://localhost:5000
LOAD_API_KEY=<project API key>
LOAD_ACCESS_TOKEN=<dashboard access token>
LOAD_PROJECT_ID=<project UUID>
pnpm --filter api load:test
```

For local development, `pnpm --filter api load:test:local` creates an ephemeral
organization, project, and API key, then removes its database rows after the
run. The API must already be running.

Configuration defaults:

| Variable                      | Default |
| ----------------------------- | ------: |
| `LOAD_CONCURRENCY`            |    `10` |
| `LOAD_DURATION_SECONDS`       |    `15` |
| `LOAD_REQUEST_TIMEOUT_MS`     | `10000` |
| `LOAD_MAX_ERROR_RATE_PERCENT` |     `1` |
| `LOAD_WEIGHT_INGEST`          |     `3` |
| `LOAD_WEIGHT_TRACE_LIST`      |     `2` |
| `LOAD_WEIGHT_TRACE_METRICS`   |     `1` |
| `LOAD_WEIGHT_TRACE_DETAIL`    |     `2` |
| `LOAD_WEIGHT_HEALTH_LIVE`     |     `1` |
| `LOAD_WEIGHT_HEALTH_READY`    |     `1` |
| `LOAD_CLEANUP_DELAY_MS`       |  `3000` |

The production ingestion limiter defaults to 600 requests per minute per API
key. Capacity tests above that rate must run against an isolated API instance
with an explicitly higher `RATE_LIMIT_INGEST_MAX`; never weaken the production
limit for benchmarking.
