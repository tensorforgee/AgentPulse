import Link from "next/link";
import { CopyButton } from "@/components/copy-button";

const SDK_INSTALL_COMMAND = "pnpm add @agentpulse/sdk";
const SDK_ENVIRONMENT = `AGENTPULSE_API_KEY=<your-project-api-key>
AGENTPULSE_BASE_URL=http://127.0.0.1:5000`;
const FIRST_TRACE_TYPESCRIPT = `import { AgentPulse } from "@agentpulse/sdk";

const pulse = new AgentPulse(
  process.env.AGENTPULSE_API_KEY!,
  process.env.AGENTPULSE_BASE_URL ?? "http://127.0.0.1:5000",
);

const trace = pulse.startTrace({
  agentName: "support-agent",
  name: "answer-question",
});
const span = pulse.startSpan(trace, {
  type: "llm_call",
  name: "generate-answer",
  input: { question: "How do I reset my password?" },
});

pulse.endSpan(span, {
  status: "success",
  latencyMs: 240,
  output: { answer: "Open account settings…" },
  inputTokens: 120,
  outputTokens: 32,
  estimatedCost: "0.0012",
});

await pulse.endTrace(trace, { status: "success" });`;

const SUPPORT_EXAMPLE_URL =
  "https://github.com/tensorforgee/AgentPulse/tree/main/examples/support-rag-agent";

export function FirstTraceGuide({ projectName }: { projectName?: string }) {
  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 text-left sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            First trace
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Connect {projectName ?? "your project"} to AgentPulse
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Follow these steps in your server-side TypeScript agent using the
            published V1 SDK package.
          </p>
        </div>
        <Link
          href="/app/api-keys"
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Create API key
        </Link>
      </div>

      <ol className="mt-6 grid gap-4 lg:grid-cols-3">
        <GuideStep number="1" title="Create and save a key">
          Create a project key. Its raw value is shown once, so move it directly
          to a password manager or secret manager.
        </GuideStep>
        <GuideStep number="2" title="Install the SDK">
          <p className="mb-2">Run from your agent package:</p>
          <CopyableCode value={SDK_INSTALL_COMMAND} label="Copy install command" />
        </GuideStep>
        <GuideStep number="3" title="Configure server-side env">
          <CopyableCode value={SDK_ENVIRONMENT} label="Copy environment setup" />
        </GuideStep>
      </ol>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <p className="text-sm font-semibold text-white">4. Send your first trace</p>
          <CopyButton
            value={FIRST_TRACE_TYPESCRIPT}
            label="Copy TypeScript"
            className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          />
        </div>
        <pre className="max-h-96 overflow-auto p-4 text-xs leading-5 text-slate-200">
          <code>{FIRST_TRACE_TYPESCRIPT}</code>
        </pre>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        Need a complete success and failure workflow?{" "}
        <a
          href={SUPPORT_EXAMPLE_URL}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-indigo-700 underline underline-offset-2"
        >
          Open the support RAG agent example
        </a>
        .
      </p>
    </section>
  );
}

function GuideStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
          {number}
        </span>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
    </li>
  );
}

function CopyableCode({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-slate-950">
      <pre className="overflow-x-auto whitespace-pre-wrap p-3 text-xs leading-5 text-slate-200">
        <code>{value}</code>
      </pre>
      <div className="border-t border-slate-800 px-3 py-2 text-right">
        <CopyButton
          value={value}
          label={label}
          className="text-xs font-semibold text-indigo-300 hover:text-indigo-200"
        />
      </div>
    </div>
  );
}
