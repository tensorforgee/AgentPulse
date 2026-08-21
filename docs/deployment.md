# AgentPulse V1 Deployment

AgentPulse can run on any platform that provides two Node.js services and
PostgreSQL 18. The repository also includes a Docker Compose path for a small
self-hosted deployment. Redis, background workers, and other Step 15 systems are
not required.

## Production topology

```text
Browser -> Next.js web -> NestJS API -> PostgreSQL 18
External agent -> @agentpulse/sdk -> NestJS API
```

The Next.js server uses `AGENTPULSE_API_URL` privately. The SDK needs the public
HTTPS API origin. Put TLS and a reverse proxy/load balancer in front of both
public services.

## Environment variables

### API

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | Platform-dependent | Listener port; defaults to `5000`. |
| `CORS_ORIGINS` | Yes in production | Comma-separated exact web origins, for example `https://agentpulse.example.com`. Wildcards are not used. |
| `TRUST_PROXY_HOPS` | No | Number of trusted reverse-proxy hops; defaults to the safe direct-connection value `0`. |
| `DATABASE_URL` | Yes | PostgreSQL connection URL. Require TLS when the database is reached over a network. |
| `JWT_ACCESS_SECRET` | Yes | High-entropy access-token signing secret, at least 32 random characters. |
| `JWT_REFRESH_SECRET` | Yes | Separate high-entropy refresh-token signing secret. |

The API also accepts optional configuration groups:

- Rate limiting: `RATE_LIMIT_AUTH_SIGNUP_MAX`, `RATE_LIMIT_AUTH_LOGIN_MAX`,
  `RATE_LIMIT_AUTH_REFRESH_MAX`, `RATE_LIMIT_AUTH_WINDOW_MS`,
  `RATE_LIMIT_API_KEY_INVALID_MAX`, `RATE_LIMIT_API_KEY_INVALID_WINDOW_MS`,
  `RATE_LIMIT_INGEST_MAX`, `RATE_LIMIT_INGEST_WINDOW_MS`,
  `RATE_LIMIT_RCA_MAX`, `RATE_LIMIT_RCA_WINDOW_MS`, and
  `RATE_LIMIT_MAX_BUCKETS`. Built-in defaults apply when these are unset.
- AI root-cause analysis: `RCA_PROVIDER_API_KEY`, `RCA_PROVIDER_MODEL`, and
  optional `RCA_PROVIDER_BASE_URL`. RCA returns its documented graceful
  unconfigured response unless both the key and model are set.
- Alert delivery: `ALERT_WEBHOOK_URLS_JSON`, a JSON object mapping project IDs
  to HTTPS webhook URLs. Alert creation and ingestion continue if this setting
  is absent, invalid, or a delivery fails.

Webhook URLs, provider keys, JWT secrets, and `DATABASE_URL` are secrets. Keep
them in the hosting platform's secret manager even though some are optional.

### Web

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | Platform-dependent | Listener port; defaults to `3000`. |
| `AGENTPULSE_API_URL` | Yes | Server-only API base URL. Prefer the platform's private service URL. |

### Demo agent

| Variable | Required | Purpose |
| --- | --- | --- |
| `AGENTPULSE_API_KEY` | Yes | Project key created in AgentPulse; never commit it. |
| `AGENTPULSE_BASE_URL` | Yes outside localhost | Public API origin, without `/v1/ingest`. |

Store production values in the deployment platform's secret manager. Never put
them in Git, image layers, build arguments, screenshots, or logs. Rotate both
JWT secrets deliberately; changing them invalidates the corresponding tokens.

## Managed-platform deployment

1. Provision PostgreSQL 18 with TLS, backups, and a private connection path when
   available.
2. Configure the API variables above.
3. Run `pnpm --filter api db:migrate:deploy` as a release/CI job before starting
   the new API revision. Do not use `prisma migrate dev` or `db push` in
   production.
4. Build the API with `pnpm --filter api build` and run it with
   `pnpm --filter api start:prod`.
5. Configure `AGENTPULSE_API_URL`, build the web service with
   `pnpm --filter web build`, and run it with `pnpm --filter web start`.
6. Route public HTTPS traffic to the web service and API. Confirm the configured
   web origin exactly matches an entry in `CORS_ORIGINS`.
7. Verify signup, workspace creation, API-key creation, demo ingestion, and the
   trace dashboard before announcing the deployment.

Run migrations once per release, not from every API replica. Review migration
SQL and take a database backup before applying any future destructive change.
Use `pnpm --filter api db:migrate:status` before and after the release to verify
that the target database has no pending or failed migrations.

Configure hosting probes as follows:

- `GET /health/live` is the liveness probe. It does not depend on PostgreSQL and
  should only restart a process that cannot answer HTTP.
- `GET /health/ready` is the readiness probe. It returns `503` when PostgreSQL
  is unavailable and should remove an API instance from traffic without using
  it as an aggressive restart signal.
- `GET /` on the web service is its startup/readiness probe; it does not expose
  API credentials because all backend access remains server-side.

When the API is behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact
number of trusted hops between the client and NestJS. Keep it at `0` for direct
connections. Do not set a broad trust value: client IPs feed the authentication
and invalid-API-key rate-limit buckets. Configure the proxy to replace, rather
than append untrusted client-supplied forwarding headers.

## Docker Compose deployment

Docker Compose 2.20 or newer is required for the health and completion
conditions used by the stack.

```powershell
Copy-Item deploy/.env.example deploy/.env
# Replace every placeholder in deploy/.env with deployment-specific values.
docker compose --env-file deploy/.env -f deploy/compose.production.yml up --build -d
```

The Compose stack:

- runs PostgreSQL 18 on a named volume without publishing its port;
- runs `prisma migrate deploy` after PostgreSQL becomes healthy;
- starts the API only after the migration job succeeds;
- starts the web service only after the API readiness check passes.

`deploy/.env` is ignored by Git. Use a URL-safe database password in this
example so the same value can appear in `POSTGRES_PASSWORD` and `DATABASE_URL`.
For an existing managed database, remove the Compose `postgres` service and set
`DATABASE_URL` to the provider connection string instead.

Production operators must additionally configure HTTPS, a reverse proxy,
database backups, monitoring, log retention, and platform-level request/rate
limits. Preserve `text/event-stream` responses for project realtime updates by
disabling proxy buffering and setting an appropriate idle timeout on the SSE
route. Do not expose PostgreSQL publicly.

## Production verification

```powershell
pnpm --filter api prisma:validate
pnpm --filter api build
pnpm --filter web build
```

Then perform the reviewer flow in [demo.md](./demo.md). Check that the API and
web health probes succeed, `db:migrate:status` reports no pending migrations,
and no `.env` file is tracked.

## Operational references

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Prisma production migrations](https://www.prisma.io/docs/cli/migrate/deploy)
- [Docker Compose startup ordering](https://docs.docker.com/compose/how-tos/startup-order/)
