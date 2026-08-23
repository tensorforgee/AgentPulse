import { AgentPulse } from "@agentpulse/sdk";
import { runSupportWorkflow } from "./workflow";

function requiredApiKey(): string {
  const value = process.env.AGENTPULSE_API_KEY?.trim();
  if (!value) {
    throw new Error(
      "AGENTPULSE_API_KEY is required. Create a project key and set it in the environment.",
    );
  }
  return value;
}

async function main() {
  const simulateFailure = process.argv.includes("--simulate-failure");
  const baseUrl = process.env.AGENTPULSE_BASE_URL ?? "http://127.0.0.1:5000";
  const client = new AgentPulse(requiredApiKey(), baseUrl);
  const result = await runSupportWorkflow(client, {
    requestId: `support-${Date.now()}`,
    customerId: simulateFailure ? "customer-missing" : "customer-123",
    question: simulateFailure
      ? "Why are traces missing for this customer?"
      : "How do I rotate and revoke an API key?",
    simulateAccountFailure: simulateFailure,
  });

  console.log(
    `Support workflow ${result.status}: trace ${result.traceId} (${result.spansProcessed} spans)`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Support workflow failed: ${message}`);
  process.exitCode = 1;
});
