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

This is the primary workload for the
[AgentPulse reviewer demo](../../docs/demo.md).

## Scenarios

| Command                                                                           | Trace result                                         | Spans and evidence                                                                                                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @agentpulse/support-rag-agent-example start`                       | Success, 260 ms, 378 tokens, `0.0015` estimated cost | Root `agent` with successful `retrieval`, `tool_call`, and `llm_call` children; the local generator returns a grounded API-key rotation answer. |
| `pnpm --filter @agentpulse/support-rag-agent-example start -- --simulate-failure` | Failed, 140 ms, 84 tokens, `0.0001` estimated cost   | Root `agent` with successful `retrieval` and failed `tool_call` children; `CustomerNotFoundError` prevents the LLM span from starting.          |

The values above are deterministic fixtures asserted by
[`test/workflow.test.js`](test/workflow.test.js). Trace IDs and timestamps are
generated for each invocation.

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

Expected terminal output has this shape:

```text
Support workflow success: trace <generated-uuid> (4 spans)
Support workflow failed: trace <generated-uuid> (3 spans)
```

In AgentPulse, open **Runs** and select each trace to inspect its nested span
timeline, provider/model, inputs/outputs, tokens, estimated cost, and captured
errors. The failed trace also exposes **Analyze failure**, which returns local
evidence-based RCA when no external provider is configured.
