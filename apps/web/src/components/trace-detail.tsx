"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { requestJson } from "@/lib/client-api";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatTimestamp,
} from "@/lib/telemetry-format";
import type {
  RcaResult,
  SpanDetail,
  TraceDetail as TraceDetailType,
} from "@/lib/types";

interface SpanNode {
  span: SpanDetail;
  children: SpanNode[];
}

export function TraceDetail({ traceId }: { traceId: string }) {
  const [state, setState] = useState<{
    traceId: string;
    trace: TraceDetailType | null;
    error: string;
  }>({ traceId: "", trace: null, error: "" });

  useEffect(() => {
    let active = true;
    requestJson<TraceDetailType>(`/api/traces/${traceId}`).then(
      (trace) => {
        if (active) setState({ traceId, trace, error: "" });
      },
      (caught: unknown) => {
        if (active) {
          setState({
            traceId,
            trace: null,
            error:
              caught instanceof Error ? caught.message : "Could not load trace",
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [traceId]);

  if (state.traceId !== traceId) return <TraceLoading />;
  if (state.error) {
    return (
      <div className="mx-auto max-w-5xl">
        <BackLink />
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-semibold text-red-900">
            Trace unavailable
          </h1>
          <p className="mt-2 text-sm text-red-700">{state.error}</p>
        </div>
      </div>
    );
  }
  if (!state.trace) return <TraceLoading />;

  return <TraceContent trace={state.trace} />;
}

function TraceContent({ trace }: { trace: TraceDetailType }) {
  const tree = useMemo(() => buildSpanTree(trace.spans), [trace.spans]);
  const [rca, setRca] = useState<RcaResult | null>(null);
  const [rcaLoading, setRcaLoading] = useState(false);
  const [rcaError, setRcaError] = useState("");
  const timelineStart = Date.parse(trace.startedAt);
  const timelineEnd = Math.max(
    trace.endedAt ? Date.parse(trace.endedAt) : timelineStart,
    ...trace.spans.map((span) =>
      span.endedAt ? Date.parse(span.endedAt) : Date.parse(span.startedAt),
    ),
  );

  async function requestRca() {
    setRcaLoading(true);
    setRcaError("");
    try {
      setRca(
        await requestJson<RcaResult>(`/api/traces/${trace.id}/rca`, {
          method: "POST",
        }),
      );
    } catch (caught) {
      setRcaError(
        caught instanceof Error
          ? caught.message
          : "Could not generate analysis",
      );
    } finally {
      setRcaLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <BackLink />
      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={trace.status} />
            <span className="font-mono text-xs text-slate-400">{trace.id}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {trace.name || trace.agentName}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {trace.agentName} · Started {formatTimestamp(trace.startedAt)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:min-w-[420px]">
          <MiniMetric
            label="Latency"
            value={formatDuration(trace.durationMs)}
          />
          <MiniMetric label="Tokens" value={formatCount(trace.totalTokens)} />
          <MiniMetric label="Cost" value={formatCost(trace.totalCost)} />
        </div>
      </div>

      {trace.errorMessage || trace.errorType ? (
        <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
            Run failure
          </p>
          <h2 className="mt-2 font-semibold text-red-950">
            {trace.errorType || "Execution error"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-red-800">
            {trace.errorMessage || "No error message was captured."}
          </p>
        </section>
      ) : null}

      {trace.status === "failed" ? (
        <section className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Root-cause analysis
              </p>
              <h2 className="mt-2 font-semibold text-indigo-950">
                Concise failure diagnosis
              </h2>
              <p className="mt-1 text-sm text-indigo-800">
                Uses captured trace and span errors; raw input and output are
                not sent to the provider.
              </p>
            </div>
            <button
              type="button"
              disabled={rcaLoading}
              onClick={() => void requestRca()}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            >
              {rcaLoading
                ? "Analyzing…"
                : rca
                  ? "Run again"
                  : "Analyze failure"}
            </button>
          </div>
          {rcaError ? (
            <p className="mt-4 text-sm text-red-700">{rcaError}</p>
          ) : null}
          {rca ? (
            <div className="mt-4 rounded-xl bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm">
              <p>{rca.explanation}</p>
              {rca.likelyFailingSpan ? (
                <p className="mt-2 text-xs text-slate-500">
                  Likely span: {rca.likelyFailingSpan.name} ·{" "}
                  {rca.likelyFailingSpan.type}
                </p>
              ) : null}
              {rca.status !== "complete" ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  AI provider{" "}
                  {rca.status === "unavailable"
                    ? "is not configured"
                    : "was unavailable"}
                  ; showing local evidence-based analysis.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5 sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Span timeline</h2>
              <p className="mt-1 text-sm text-slate-500">
                Parent and child operations in execution order.
              </p>
            </div>
            <p className="text-sm font-medium text-slate-500">
              {trace.spans.length} span{trace.spans.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {tree.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            This trace has no spans.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {tree.map((node) => (
              <SpanBranch
                key={node.span.id}
                node={node}
                depth={0}
                timelineStart={timelineStart}
                timelineEnd={timelineEnd}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <JsonCard title="Trace metadata" value={trace.metadata} />
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold">Token breakdown</h2>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <DataPoint
              label="Input tokens"
              value={formatCount(trace.inputTokens)}
            />
            <DataPoint
              label="Output tokens"
              value={formatCount(trace.outputTokens)}
            />
            <DataPoint
              label="Total tokens"
              value={formatCount(trace.totalTokens)}
            />
            <DataPoint label="Total cost" value={formatCost(trace.totalCost)} />
          </dl>
        </article>
      </section>
    </div>
  );
}

function SpanBranch({
  node,
  depth,
  timelineStart,
  timelineEnd,
}: {
  node: SpanNode;
  depth: number;
  timelineStart: number;
  timelineEnd: number;
}) {
  const { span } = node;
  const total = Math.max(timelineEnd - timelineStart, 1);
  const started = Date.parse(span.startedAt);
  const ended = span.endedAt ? Date.parse(span.endedAt) : started;
  const left = Math.max(0, ((started - timelineStart) / total) * 100);
  const width = Math.max(1.5, (Math.max(ended - started, 1) / total) * 100);

  return (
    <>
      <article className="p-5 sm:p-6">
        <div
          className="border-l-2 border-slate-200 pl-4"
          style={{ marginLeft: Math.min(depth, 6) * 20 }}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
                  {span.type}
                </span>
                <StatusBadge status={span.status} />
                {span.parentSpanId ? (
                  <span className="text-xs text-slate-400">
                    child of {span.parentSpanId.slice(0, 8)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">root span</span>
                )}
              </div>
              <h3 className="mt-2 font-semibold">{span.name}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {span.provider || span.model
                  ? [span.provider, span.model].filter(Boolean).join(" · ")
                  : span.id}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-x-5 text-sm xl:text-right">
              <DataPoint
                label="Latency"
                value={formatDuration(span.latencyMs)}
              />
              <DataPoint
                label="Tokens"
                value={formatCount(span.inputTokens + span.outputTokens)}
              />
              <DataPoint label="Cost" value={formatCost(span.estimatedCost)} />
            </div>
          </div>

          <div className="mt-4">
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={
                  span.status === "failed"
                    ? "absolute h-full rounded-full bg-red-400"
                    : "absolute h-full rounded-full bg-indigo-400"
                }
                style={{
                  left: `${Math.min(left, 98.5)}%`,
                  width: `${Math.min(width, 100 - left)}%`,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>{formatTimestamp(span.startedAt)}</span>
              <span>
                {span.endedAt ? formatTimestamp(span.endedAt) : "In progress"}
              </span>
            </div>
          </div>

          {span.errorMessage || span.errorType ? (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <span className="font-semibold">
                {span.errorType || "Error"}:
              </span>{" "}
              {span.errorMessage || "No message captured"}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <JsonDisclosure title="Input" value={span.input} />
            <JsonDisclosure title="Output" value={span.output} />
          </div>
          {span.attributes ? (
            <JsonDisclosure title="Attributes" value={span.attributes} />
          ) : null}
        </div>
      </article>
      {node.children.map((child) => (
        <SpanBranch
          key={child.span.id}
          node={child}
          depth={depth + 1}
          timelineStart={timelineStart}
          timelineEnd={timelineEnd}
        />
      ))}
    </>
  );
}

function buildSpanTree(spans: SpanDetail[]) {
  const nodes = new Map<string, SpanNode>(
    spans.map((span) => [span.id, { span, children: [] }]),
  );
  const roots: SpanNode[] = [];

  for (const span of spans) {
    const node = nodes.get(span.id);
    if (!node) continue;
    const parent = span.parentSpanId ? nodes.get(span.parentSpanId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

function JsonDisclosure({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        {title}
      </summary>
      <PrettyJson value={value} />
    </details>
  );
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <PrettyJson value={value} />
    </article>
  );
}

function PrettyJson({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="mt-3 text-sm text-slate-400">No data captured.</p>;
  }
  const serialized = JSON.stringify(value, null, 2);
  const display =
    serialized.length > 5000
      ? `${serialized.slice(0, 5000)}\n… truncated`
      : serialized;
  return (
    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100">
      {display}
    </pre>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-slate-700">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/app/runs"
      className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
    >
      ← Back to runs
    </Link>
  );
}

function TraceLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse" aria-label="Loading trace">
      <div className="h-5 w-28 rounded bg-slate-200" />
      <div className="mt-6 h-10 w-2/5 rounded bg-slate-200" />
      <div className="mt-8 h-28 rounded-2xl bg-slate-200" />
      <div className="mt-6 h-80 rounded-2xl bg-slate-200" />
    </div>
  );
}
