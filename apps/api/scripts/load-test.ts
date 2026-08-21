import 'dotenv/config';
import { loadConfigFromEnvironment, runLoadTest } from './load-test-core';

async function main(): Promise<void> {
  const config = loadConfigFromEnvironment();
  const report = await runLoadTest(config);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown load error';
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
});
