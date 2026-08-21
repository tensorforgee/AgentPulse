# AgentPulse API

NestJS API for authentication, tenant-safe organizations/projects, project API
keys, telemetry ingestion, and trace reads. PostgreSQL access is provided by
Prisma; one trace represents one complete agent execution.

Run from the repository root:

```powershell
pnpm --filter api db:migrate:deploy
pnpm --filter api start:dev
pnpm --filter api test:e2e -- --runInBand
```

Copy `.env.example` to the ignored `.env` file and provide local values. For
production configuration and migration ordering, see
[`docs/deployment.md`](../../docs/deployment.md).
