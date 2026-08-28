"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { requestJson } from "@/lib/client-api";
import type { BillingSummary } from "@/lib/types";

export default function BillingPage() {
  const { selectedOrganization } = useWorkspace();
  const [state, setState] = useState<{
    organizationId: string;
    summary: BillingSummary | null;
    error: string;
  }>({ organizationId: "", summary: null, error: "" });
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"checkout" | "portal" | "">("");

  useEffect(() => {
    if (!selectedOrganization) return;
    let active = true;
    setLoading(true);
    requestJson<BillingSummary>(
      `/api/organizations/${selectedOrganization.id}/billing`,
    ).then(
      (summary) => {
        if (active) {
          setState({
            organizationId: selectedOrganization.id,
            summary,
            error: "",
          });
          setLoading(false);
        }
      },
      (caught: unknown) => {
        if (active) {
          setState({
            organizationId: selectedOrganization.id,
            summary: null,
            error:
              caught instanceof Error
                ? caught.message
                : "Could not load billing",
          });
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [selectedOrganization]);

  const summary =
    selectedOrganization && state.organizationId === selectedOrganization.id
      ? state.summary
      : null;
  const error =
    selectedOrganization && state.organizationId === selectedOrganization.id
      ? state.error
      : "";
  const canManage =
    selectedOrganization?.role === "owner" ||
    selectedOrganization?.role === "admin";

  async function openStripe(target: "checkout" | "portal") {
    if (!selectedOrganization) return;
    setAction(target);
    setState((current) => ({ ...current, error: "" }));
    try {
      const result = await requestJson<{ url: string }>(
        `/api/organizations/${selectedOrganization.id}/billing/${target}`,
        { method: "POST" },
      );
      window.location.assign(result.url);
    } catch (caught) {
      setState((current) => ({
        ...current,
        error:
          caught instanceof Error
            ? caught.message
            : "Could not open Stripe billing",
      }));
      setAction("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
        Organization billing
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        View plan entitlements and exact usage for the selected organization.
      </p>

      {!selectedOrganization ? (
        <EmptyState message="Select an organization to view billing." />
      ) : loading || !summary ? (
        error ? (
          <ErrorState message={error} />
        ) : (
          <BillingLoading />
        )
      ) : (
        <>
          {error ? <ErrorState message={error} /> : null}
          <section className="mt-8 grid gap-4 md:grid-cols-2">
            <Card label="Plan" value={summary.plan} />
            <Card
              label="Subscription"
              value={summary.subscriptionStatus.replace("_", " ")}
              detail={
                summary.cancelAtPeriodEnd
                  ? "Cancels at the end of the billing period"
                  : undefined
              }
            />
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Current usage</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(summary.period.startedAt).toLocaleDateString()} –{" "}
                  {new Date(summary.period.endsAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Usage
                label="Projects"
                value={summary.usage.projects}
                limit={summary.entitlements.projectLimit}
              />
              <Usage
                label="Members"
                value={summary.usage.members}
                limit={summary.entitlements.organizationMemberLimit}
              />
              <Usage
                label="Traces"
                value={summary.usage.traces}
                limit={summary.entitlements.monthlyTraceLimit}
              />
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Subscription management</h2>
            {!summary.stripe.checkoutAvailable ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Stripe billing is not configured in this environment. Usage and
                plan information remain available.
              </p>
            ) : !canManage ? (
              <p className="mt-3 text-sm text-slate-500">
                An organization owner or admin can manage this subscription.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                {summary.plan === "free" && !summary.stripe.portalAvailable ? (
                  <button
                    type="button"
                    disabled={Boolean(action)}
                    onClick={() => void openStripe("checkout")}
                    className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {action === "checkout" ? "Opening…" : "Upgrade to Pro"}
                  </button>
                ) : null}
                {summary.stripe.portalAvailable ? (
                  <button
                    type="button"
                    disabled={Boolean(action)}
                    onClick={() => void openStripe("portal")}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                  >
                    {action === "portal" ? "Opening…" : "Manage subscription"}
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold capitalize">{value}</p>
      {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
    </article>
  );
}

function Usage({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit: number | null;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">
        {value.toLocaleString()} /{" "}
        {limit === null ? "Unlimited" : limit.toLocaleString()}
      </p>
    </div>
  );
}

function BillingLoading() {
  return (
    <div className="mt-8 space-y-4" role="status">
      <span className="sr-only">Loading billing…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-2xl bg-slate-200"
        />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}
