# AgentPulse demo agent

This deterministic workload proves the core AgentPulse flow without requiring an
external AI provider. One command emits a successful research run and a failed
support-tool run through the local `@agentpulse/sdk`.

## Run it

1. Start PostgreSQL and the AgentPulse API.
2. Create an organization, project, and project API key in the web app.
3. Set the key in your shell without writing it to a tracked file:

   ~~~powershell
   $env:AGENTPULSE_API_KEY = "<your-project-api-key>"
   ~~~

4. From the repository root, run:

   ~~~powershell
   pnpm demo
   ~~~

`AGENTPULSE_BASE_URL` defaults to `http://127.0.0.1:5000`. The command prints
only generated trace IDs and span counts; it never prints the API key.

After the command completes, open the selected project's **Runs** page. The two
new traces show different statuses, latency, tokens, cost, nested spans, and a
representative tool failure.
