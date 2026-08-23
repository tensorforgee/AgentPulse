# Support RAG agent example

This TypeScript example shows how an application developer can instrument a
retrieval-augmented customer-support workflow with `@agentpulse/sdk`. It uses a
small local knowledge base and deterministic answer generator, so no AI provider
account or paid credential is required.

Each invocation creates exactly one trace. The successful path contains a root
agent span with retrieval, account-tool, and LLM-style child spans. The failure
path records a failed account-tool span and failed trace with useful error
context. Both paths include deterministic latency, token, cost, input/output,
provider/model, and workflow metadata.
Token and cost values are representative observability fixtures, not charges
from an external provider.

## Run

1. Start AgentPulse and create a project API key.
2. Set the key and optional API URL in the shell; do not put a real key in the
   tracked example file.

   ```powershell
   $env:AGENTPULSE_API_KEY = "<project-api-key>"
   $env:AGENTPULSE_BASE_URL = "http://127.0.0.1:5000"
   ```

3. Run the successful workflow:

   ```powershell
   pnpm --filter @agentpulse/support-rag-agent-example start
   ```

4. Run the observable failure path:

   ```powershell
   pnpm --filter @agentpulse/support-rag-agent-example start -- --simulate-failure
   ```

The command prints only the generated trace ID, status, and span count. It sends
telemetry through the SDK to `POST /v1/ingest` and never prints the API key.
