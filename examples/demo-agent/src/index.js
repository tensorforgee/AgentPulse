const { AgentPulse } = require("@agentpulse/sdk");
const {
  runFailedToolAgent,
  runSuccessfulResearchAgent,
} = require("./scenarios");

function requiredApiKey() {
  const value = process.env.AGENTPULSE_API_KEY;
  if (!value || value.trim() === "") {
    throw new Error(
      "AGENTPULSE_API_KEY is required. Create a project key in AgentPulse and set it in your environment.",
    );
  }
  return value.trim();
}

async function main() {
  const baseUrl = process.env.AGENTPULSE_BASE_URL ?? "http://127.0.0.1:5000";
  const client = new AgentPulse(requiredApiKey(), baseUrl);
  const successful = await runSuccessfulResearchAgent(client, Date.now() - 5_000);
  const failed = await runFailedToolAgent(client, Date.now());

  console.log("AgentPulse demo telemetry created:");
  console.log(
    `- ${successful.status}: trace ${successful.traceId} (${successful.spansProcessed} spans)`,
  );
  console.log(
    `- ${failed.status}: trace ${failed.traceId} (${failed.spansProcessed} spans)`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown demo error";
  console.error(`AgentPulse demo failed: ${message}`);
  process.exitCode = 1;
});
