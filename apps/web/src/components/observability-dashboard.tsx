"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { StatusBadge } from "@/components/status-badge";
import { requestJson } from "@/lib/client-api";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatTimestamp,
} from "@/lib/telemetry-format";
import type {
  AlertEvent,
  TelemetryStatus,
  TraceListItem,
  TraceListResponse,
} from "@/lib/types";

const PAGE_SIZE = 10;

interface Filters {
  status: "" | TelemetryStatus;
  search: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { status: "", search: "", from: "", to: "" };

export function ObservabilityDashboard() {
  const { selectedProject } = useWorkspace();
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [listState, setListState] = useState<{
    key: string;
    response: TraceListResponse | null;
    error: string;
  }>({ key: "", response: null, error: "" });
  const [metricState, setMetricState] = useState<{
    projectId: string;
    traces: TraceListItem[];
    error: string;
  }>({ projectId: "", traces: [], error: "" });
  const [alertState, setAlertState] = useState<{
    projectId: string;
    events: AlertEvent[];
    error: string;
  }>({ projectId: "", events: [], error: "" });
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "connected" | "reconnecting"
  >("connecting");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    if (filters.from) {
      params.set(
        "from",
        new Date(`${filters.from}T00:00:00.000Z`).toISOString(),
      );
    }
    if (filters.to) {
      params.set("to", new Date(`${filters.to}T23:59:59.999Z`).toISOString());
    }
    return params.toString();
  }, [filters, page]);

  const requestKey = selectedProject ? `${selectedProject.id}?${query}` : "";

  useEffect(() => {
    if (!selectedProject) return;

    const source = new EventSource(
      `/api/projects/${selectedProject.id}/events`,
    );
    const refresh = () => setRefreshVersion((current) => current + 1);
    source.onopen = () => setRealtimeStatus("connected");
    source.onerror = () => setRealtimeStatus("reconnecting");
    source.addEventListener("telemetry.ingested", refresh);
    source.addEventListener("alert.triggered", refresh);

    return () => {
      source.removeEventListener("telemetry.ingested", refresh);
      source.removeEventListener("alert.triggered", refresh);
      source.close();
    };
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;
    let active = true;

    requestJson<TraceListResponse>(
      `/api/projects/${selectedProject.id}/traces?${query}`,
    ).then(
      (response) => {
        if (active) setListState({ key: requestKey, response, error: "" });
      },
      (caught: unknown) => {
        if (active) {
          setListState({
            key: requestKey,
            response: null,
            error:
              caught instanceof Error ? caught.message : "Could not load runs",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [query, refreshVersion, requestKey, selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;
    let active = true;

    loadAllProjectTraces(selectedProject.id).then(
      (traces) => {
        if (active) {
          setMetricState({ projectId: selectedProject.id, traces, error: "" });
        }
      },
      (caught: unknown) => {
        if (active) {
          setMetricState({
            projectId: selectedProject.id,
            traces: [],
            error:
              caught instanceof Error
                ? caught.message
                : "Could not load metrics",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [refreshVersion, selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;
    let active = true;

    requestJson<AlertEvent[]>(
      `/api/projects/${selectedProject.id}/alert-events`,
    ).then(
      (events) => {
        if (active) {
          setAlertState({ projectId: selectedProject.id, events, error: "" });
        }
      },
      (caught: unknown) => {
        if (active) {
          setAlertState({
            projectId: selectedProject.id,
            events: [],
            error:
              caught instanceof Error
                ? caught.message
                : "Could not load alerts",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [refreshVersion, selectedProject]);

  if (!selectedProject) {
    return (
      <div className="mx-auto max-w-5xl">
        <DashboardHeading />
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold">
            Select a project to view runs
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Create a project in the workspace, then return here to inspect its
            telemetry.
          </p>
          <Link
            href="/app"
            className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Open workspace
          </Link>
        </div>
      </div>
    );
  }

  const list = listState.key === requestKey ? listState.response : null;
  const listError = listState.key === requestKey ? listState.error : "";
  const metrics =
    metricState.projectId === selectedProject.id
      ? calculateMetrics(metricState.traces)
      : null;
  const metricError =
    metricState.projectId === selectedProject.id ? metricState.error : "";
  const alertEvents =
    alertState.projectId === selectedProject.id ? alertState.events : [];
  const alertError =
    alertState.projectId === selectedProject.id ? alertState.error : "";

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters({
      ...draftFilters,
      search: draftFilters.search.trim(),
    });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <DashboardHeading projectName={selectedProject.name} />

      {metricError ? (
        <ErrorMessage message={metricError} />
      ) : (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total runs"
            value={metrics ? formatCount(metrics.total) : "…"}
            detail="All recorded executions"
          />
          <MetricCard
            label="Success / error"
            value={
              metrics ? `${metrics.successRate}% / ${metrics.errorRate}%` : "…"
            }
            detail="Across all run statuses"
          />
          <MetricCard
            label="Average latency"
            value={metrics ? formatDuration(metrics.averageLatency) : "…"}
            detail="Completed runs"
          />
          <MetricCard
            label="Total tokens"
            value={metrics ? formatCount(metrics.totalTokens) : "…"}
            detail="Input and output"
          />
          <MetricCard
            label="Total cost"
            value={metrics ? formatCost(String(metrics.totalCost)) : "…"}
            detail="Estimated telemetry cost"
          />
        </section>
      )}

      <AlertEventsPanel
        events={alertEvents}
        error={alertError}
        realtimeStatus={realtimeStatus}
      />

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Runs</h2>
              <p className="mt-1 text-sm text-slate-500">
                Newest executions appear first.
              </p>
            </div>
            {list ? (
              <p className="text-sm font-medium text-slate-500">
                {formatCount(list.pagination.total)} result
                {list.pagination.total === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>

          <form
            onSubmit={applyFilters}
            className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_150px_160px_160px_auto]"
          >
            <input
              value={draftFilters.search}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Search run, agent, or trace ID"
              aria-label="Search runs"
              maxLength={200}
              className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm"
            />
            <select
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as Filters["status"],
                }))
              }
              aria-label="Run status"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
            </select>
            <label className="sr-only" htmlFor="runs-from">
              From date
            </label>
            <input
              id="runs-from"
              type="date"
              value={draftFilters.from}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
              className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm"
            />
            <label className="sr-only" htmlFor="runs-to">
              To date
            </label>
            <input
              id="runs-to"
              type="date"
              value={draftFilters.to}
              min={draftFilters.from || undefined}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
              className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                Apply
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        {listError ? (
          <div className="p-6">
            <ErrorMessage message={listError} />
          </div>
        ) : !list ? (
          <TableLoading />
        ) : list.data.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="font-semibold">No runs found</h3>
            <p className="mt-2 text-sm text-slate-500">
              {hasFilters(filters)
                ? "Try clearing your filters."
                : "Send telemetry with the AgentPulse SDK to see it here."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Run</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Started</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Latency
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Tokens
                    </th>
                    <th className="px-6 py-3 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {list.data.map((trace) => (
                    <tr key={trace.id} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <Link
                          href={`/app/traces/${trace.id}`}
                          className="font-semibold text-slate-900 hover:text-indigo-600"
                        >
                          {trace.name || trace.agentName}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {trace.agentName} · {trace.id.slice(0, 8)}
                        </p>
                        {trace.errorMessage ? (
                          <p className="mt-1 max-w-sm truncate text-xs text-red-600">
                            {trace.errorMessage}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={trace.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {formatTimestamp(trace.startedAt)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-slate-600">
                        {formatDuration(trace.durationMs)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-slate-600">
                        {formatCount(trace.totalTokens)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-600">
                        {formatCost(trace.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={list.pagination.page}
              totalPages={list.pagination.totalPages}
              previous={list.pagination.hasPreviousPage}
              next={list.pagination.hasNextPage}
              onPage={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}

function AlertEventsPanel({
  events,
  error,
  realtimeStatus,
}: {
  events: AlertEvent[];
  error: string;
  realtimeStatus: "connecting" | "connected" | "reconnecting";
}) {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Triggered alerts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Rolling five-minute evaluations from persisted completed traces.
          </p>
        </div>
        <span
          className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
            realtimeStatus === "connected"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {realtimeStatus === "connected" ? "Live" : "Reconnecting"}
        </span>
      </div>

      {error ? (
        <div className="p-6">
          <ErrorMessage message={error} />
        </div>
      ) : events.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">
          No alert rules have triggered for this project.
        </p>
      ) : (
        <div className="divide-y divide-slate-200">
          {events.slice(0, 8).map((event) => (
            <article
              key={event.id}
              className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    {event.ruleType.replace("_", " ")}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatTimestamp(event.createdAt)}
                  </span>
                </div>
                <Link
                  href={`/app/traces/${event.traceId}`}
                  className="mt-2 block font-semibold hover:text-indigo-600"
                >
                  {event.ruleName}
                </Link>
                <p className="mt-1 text-sm text-slate-500">
                  Observed{" "}
                  {formatAlertValue(event.ruleType, event.observedValue)} ·
                  threshold {formatAlertValue(event.ruleType, event.threshold)}
                </p>
              </div>
              <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                Webhook: {event.deliveryStatus.replace("_", " ")}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatAlertValue(type: AlertEvent["ruleType"], value: string) {
  if (type === "error_rate") {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }
  if (type === "latency") {
    return formatDuration(Math.round(Number(value)));
  }
  return formatCost(value);
}

async function loadAllProjectTraces(projectId: string) {
  const first = await requestJson<TraceListResponse>(
    `/api/projects/${projectId}/traces?page=1&pageSize=100`,
  );
  if (first.pagination.totalPages <= 1) return first.data;

  const remaining = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
      requestJson<TraceListResponse>(
        `/api/projects/${projectId}/traces?page=${index + 2}&pageSize=100`,
      ),
    ),
  );
  return [first, ...remaining].flatMap(({ data }) => data);
}

function calculateMetrics(traces: TraceListItem[]) {
  const success = traces.filter(({ status }) => status === "success").length;
  const failed = traces.filter(({ status }) => status === "failed").length;
  const durations = traces.flatMap(({ durationMs }) =>
    durationMs === null ? [] : [durationMs],
  );
  const percentage = (value: number) =>
    traces.length ? Math.round((value / traces.length) * 100) : 0;

  return {
    total: traces.length,
    successRate: percentage(success),
    errorRate: percentage(failed),
    averageLatency: durations.length
      ? Math.round(
          durations.reduce((sum, value) => sum + value, 0) / durations.length,
        )
      : null,
    totalTokens: traces.reduce((sum, trace) => sum + trace.totalTokens, 0),
    totalCost: traces.reduce((sum, trace) => sum + Number(trace.totalCost), 0),
  };
}

function DashboardHeading({ projectName }: { projectName?: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
        Observability
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Agent runs</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {projectName
          ? `Operational telemetry for ${projectName}.`
          : "Select a project to inspect execution telemetry."}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function Pagination({
  page,
  totalPages,
  previous,
  next,
  onPage,
}: {
  page: number;
  totalPages: number;
  previous: boolean;
  next: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
      <p className="text-sm text-slate-500">
        Page {page} of {Math.max(totalPages, 1)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!previous}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function TableLoading() {
  return (
    <div className="space-y-3 p-6" aria-label="Loading runs">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-lg bg-slate-100"
        />
      ))}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </p>
  );
}

function hasFilters(filters: Filters) {
  return Boolean(
    filters.status || filters.search || filters.from || filters.to,
  );
}
