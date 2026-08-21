# AgentPulse V1 Reviewer Demo

## Five-minute flow

1. Open the web URL and create an account or sign in.
2. Create/select an organization and project.
3. Open **API keys**, create a key, and copy the plaintext value once.
4. In a local shell, set the key and deployed API URL without writing either to
   a tracked file:

   ```powershell
   $env:AGENTPULSE_API_KEY = "<one-time-project-key>"
   $env:AGENTPULSE_BASE_URL = "https://api.agentpulse.example.com"
   pnpm demo
   ```

5. Refresh **Runs**. The deterministic demo creates one successful research run
   and one failed support run.
6. Confirm the table shows different status, latency, token, and cost values.
7. Open each run. Confirm the nested span tree, LLM/tool/retrieval types,
   parent-child links, input/output summaries, and failure message.
8. Revoke the demo API key when the review is complete.

## Expected proof

The demo exercises the complete V1 path:

```text
demo agent -> local @agentpulse/sdk -> POST /v1/ingest
           -> API-key project resolution -> PostgreSQL
           -> tenant-safe trace read API -> Next.js dashboard
```

The command prints trace IDs and processed span counts but never the API key.
Running it again creates fresh representative traces.

## Screenshot checklist

Capture screenshots only from synthetic demo data and redact browser/account
identifiers if necessary. Do not include the one-time API key or environment
configuration.

- Runs dashboard with success/error metrics and both demo traces.
- Successful trace detail showing nested retrieval and LLM spans.
- Failed trace detail showing the failed tool span and error summary.
- API-key metadata list after the plaintext creation banner is dismissed.

Save approved screenshots under a future `docs/screenshots/` directory and link
them from the root README. Screenshots are intentionally not fabricated or
committed without a real deployed environment.
