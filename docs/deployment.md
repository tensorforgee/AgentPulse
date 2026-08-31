# AgentPulse V1 Deployment

AgentPulse can run on any platform that provides two Node.js services and
PostgreSQL 18. The repository includes a complete single-host Docker Compose
deployment with Caddy terminating TLS. Redis and a separate queue service are
not required for the current single-process V1.

## Production topology

```text
Browser -> Caddy (HTTPS) -> Next.js web -> NestJS API -> PostgreSQL 18
External agent -> Caddy (HTTPS) -> NestJS API
```

The Next.js server uses `AGENTPULSE_API_URL` over the private Compose network.
The SDK uses the public HTTPS API origin. Only Caddy publishes host ports;
web, API, and PostgreSQL remain private to their required Docker networks. Web
production builds use a local system-font stack and do not depend on a build-
time connection to Google Fonts.

## Environment variables

### Compose host and PostgreSQL

| Variable | Required | Purpose |
| --- | --- | --- |
| `WEB_DOMAIN` | Yes | Public web hostname without a scheme, for example `app.agentpulse.example.com`. |
| `API_DOMAIN` | Yes | Public SDK/API hostname without a scheme, for example `api.agentpulse.example.com`. |
| `POSTGRES_DB` | Yes | Database created by the PostgreSQL container. |
| `POSTGRES_USER` | Yes | Dedicated PostgreSQL application user. |
| `POSTGRES_PASSWORD` | Yes | Long, URL-safe database password used only in the ignored deploy env file. |
| `DATABASE_URL` | Yes | Private `postgres:5432` URL using the same database/user/password values. |

The Compose file derives `CORS_ORIGINS` from `WEB_DOMAIN`, uses
`AGENTPULSE_API_URL=http://api:5000` only inside Docker, and defaults
`TRUST_PROXY_HOPS` to the single Caddy hop. This prevents the public domain,
CORS origin, and internal routing configuration from drifting independently.

### API

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | Platform-dependent | Listener port; defaults to `5000`. |
| `CORS_ORIGINS` | Yes in production | Comma-separated exact HTTPS web origins, for example `https://agentpulse.example.com`. HTTP and wildcards are rejected in production. |
| `TRUST_PROXY_HOPS` | No | Number of trusted reverse-proxy hops; defaults to the safe direct-connection value `0`. |
| `DATABASE_URL` | Yes | PostgreSQL connection URL. Require TLS when the database is reached over a network. |
| `JWT_ACCESS_SECRET` | Yes | High-entropy access-token signing secret, at least 32 random characters. |
| `JWT_REFRESH_SECRET` | Yes | Separate high-entropy refresh-token signing secret. |
| `AGENTPULSE_WEB_URL` | Yes for Stripe | Exact public web origin used for Checkout and portal return URLs. HTTPS is required in production. |

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
- Stripe subscriptions: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `STRIPE_PRO_PRICE_ID`. Configure all three to enable hosted Checkout,
  signed subscription webhooks, and the customer portal. When unset, usage
  remains available while upgrade and management actions fail closed.
- Alert delivery: `ALERT_WEBHOOK_ENCRYPTION_KEY`, a base64-encoded 32-byte key
  used to encrypt per-project signing secrets. Generate it with
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
  `ALERT_WEBHOOK_URLS_JSON` remains an optional unsigned fallback for existing
  deployments that map project IDs to HTTPS webhook URLs.

Webhook URLs, provider keys, JWT secrets, and `DATABASE_URL` are secrets. Keep
them in the hosting platform's secret manager even though some are optional.
Production webhook and RCA provider URLs must use HTTPS, cannot embed URL
credentials, and must not rely on redirects. Plain HTTP remains available only
for local development and test endpoints.

An organization owner or admin can configure the selected project's webhook
through the authenticated project API:

```http
PUT /projects/{projectId}/alert-webhook
Content-Type: application/json

{"url":"https://hooks.example.com/agentpulse"}
```

The response contains the signing secret once. Store it in the receiver's
secret manager; later `GET` responses report the URL and source without
returning the secret. `POST /projects/{projectId}/alert-webhook/test` sends a
signed test event, and `DELETE /projects/{projectId}/alert-webhook` removes the
configuration. These endpoints use the existing project tenant guard and are
limited to organization owners and admins.

In production, tenant webhook URLs must use HTTPS, cannot contain credentials,
and cannot resolve to loopback, private, link-local, or cloud metadata targets.
URLs are checked on configuration and again before delivery. Redirects are not
followed.

The legacy environment fallback uses a single JSON value (keep the outer
environment-variable quotes required by your hosting platform):

```json
{
  "7cb34107-8c31-4c33-af45-c7e33c123fb0": "https://hooks.example.com/agentpulse/project-token"
}
```

AgentPulse sends one `POST` with `Content-Type: application/json` and a
three-second timeout. Project-configured deliveries include
`X-AgentPulse-Timestamp` (Unix seconds) and `X-AgentPulse-Signature`, formatted
as `v1=<hex HMAC-SHA256>`. Verify the signature against the exact request body
using the message `<timestamp>.<body>` and reject stale timestamps. The body is
compatible with receivers that accept a Slack-style `text` field and also
contains the structured event:

```json
{
  "text": "[AgentPulse] High cost triggered: cost observed 2 (threshold 1)",
  "agentpulse": {
    "id": "1e399dc9-34de-446b-912f-5fc719b018fc",
    "projectId": "7cb34107-8c31-4c33-af45-c7e33c123fb0",
    "alertRuleId": "39cc1c3e-5519-4057-a2da-bb480e10c2c7",
    "traceId": "6ca54026-bf99-43ad-91d9-fd6f9ab2a945",
    "ruleName": "High cost",
    "ruleType": "cost",
    "threshold": "1",
    "observedValue": "2",
    "windowStartedAt": "2026-08-21T10:00:00.000Z",
    "windowEndedAt": "2026-08-21T10:05:00.000Z",
    "deliveryStatus": "pending",
    "deliveryAttemptedAt": null,
    "deliveryError": null,
    "createdAt": "2026-08-21T10:05:00.000Z"
  }
}
```

Alert-event API responses expose `deliveryStatus`, `deliveryAttemptedAt`, and a
sanitized `deliveryError`. Invalid per-project URLs are recorded as
`not_configured`; request failures are `failed`; successful 2xx responses are
`delivered`. Legacy `ALERT_WEBHOOK_URLS_JSON` deliveries remain unsigned for
backwards compatibility; migrate them through the project API to enable
signatures. No authorization header is added.

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

## Recommended Docker Compose deployment

Docker Compose 2.20 or newer is required for the health and completion
conditions used by the stack. Use one Linux VM with a public IPv4 address, at
least 2 GiB RAM, persistent storage, and inbound TCP 80/443 plus UDP 443. Point
an A record for `WEB_DOMAIN` and `API_DOMAIN` directly at that host before
starting the stack. Add AAAA records only when IPv6 routing and the host firewall
are configured. Caddy then obtains and renews TLS certificates and redirects
HTTP to HTTPS automatically.

From a clean host:

1. Install supported Docker Engine and Docker Compose releases, then enable the
   Docker service at boot.
2. Allow inbound TCP 80/443 and UDP 443; keep every other application/database
   port closed.
3. Clone AgentPulse at the reviewed release revision and enter the repository.
4. Copy the example below, replace every placeholder, and restrict the resulting
   file to the deployment account.
5. Start the stack and wait for the migration, API, and web health gates.

```sh
cp deploy/.env.example deploy/.env
# Replace every placeholder in deploy/.env with deployment-specific values.
chmod 600 deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.production.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.production.yml run --rm --no-deps caddy validate --config /etc/caddy/Caddyfile
docker compose --env-file deploy/.env -f deploy/compose.production.yml up --build -d
```

The Compose stack:

- makes Caddy the only public service and provisions TLS for both domains;
- runs PostgreSQL 18 on a named volume without publishing its port;
- runs `prisma migrate deploy` after PostgreSQL becomes healthy;
- starts the API only after the migration job succeeds;
- starts the web service only after the API readiness check passes;
- starts Caddy only after both application services pass their health checks;
- preserves SSE delivery because Caddy flushes `text/event-stream` responses
  immediately.

`deploy/.env` is ignored by Git. Use a URL-safe database password in this
example so the same value can appear in `POSTGRES_PASSWORD` and `DATABASE_URL`.
Do not expose that file or copy it into an image. For an existing managed
database, remove the Compose `postgres` service, its dependency/volume, and set
`DATABASE_URL` to the provider's private TLS connection string.

The included topology is direct client -> Caddy -> API, so
`TRUST_PROXY_HOPS=1` is required for correct per-client rate-limit identity.
Caddy replaces untrusted forwarding information before proxying. If a CDN or
load balancer is added later, configure its trusted proxy ranges in Caddy and
recalculate the exact API hop count; do not increase this value speculatively.

After startup, verify the release before creating user data:

```sh
docker compose --env-file deploy/.env -f deploy/compose.production.yml ps --all
docker compose --env-file deploy/.env -f deploy/compose.production.yml logs migrate
curl --fail --silent --show-error https://api.your-domain.example/health/live
curl --fail --silent --show-error https://api.your-domain.example/health/ready
```

The `migrate` container must show a successful `prisma migrate deploy` before
the API becomes healthy. A failed migration prevents the API revision from
starting. Back up the database before future destructive migrations, and never
run `prisma migrate dev` or `db push` in production.

Still configure host backups for the `postgres_data` volume, off-host backup
retention, OS/container security updates, log retention, and provider-level
firewall rules. Do not expose PostgreSQL publicly.

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
