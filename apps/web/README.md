# AgentPulse Web

Next.js dashboard for AgentPulse authentication, workspace/project selection,
API-key management, run metrics, trace listing, and nested span detail.

Run from the repository root:

```powershell
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web build
```

Copy `.env.example` to the ignored `.env.local` file. `AGENTPULSE_API_URL` is a
server-only URL used by Route Handlers; tokens remain in HttpOnly cookies. See
[`docs/deployment.md`](../../docs/deployment.md) for production configuration.
