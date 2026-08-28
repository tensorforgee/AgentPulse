"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/components/workspace-context";
import { requestJson } from "@/lib/client-api";
import type { Organization } from "@/lib/types";

export default function InvitationAcceptancePage() {
  return (
    <Suspense fallback={<InvitationLoading />}>
      <InvitationAcceptanceForm />
    </Suspense>
  );
}

function InvitationAcceptanceForm() {
  const workspace = useWorkspace();
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const organization = await requestJson<Organization>(
        "/api/organization-invites/accept",
        { method: "POST", body: JSON.stringify({ token }) },
      );
      await workspace.refreshOrganizations();
      await workspace.selectOrganization(organization.id);
      setMessage(`You joined ${organization.name}.`);
      window.history.replaceState({}, "", "/app/invitations");
      setToken("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not accept invitation",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
        Organization invitation
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Join organization
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Sign in with the exact email address that received the invitation.
      </p>
      <form
        onSubmit={accept}
        className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="text-sm font-medium">
          Invitation token
          <input
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !token}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? "Joining…" : "Accept invitation"}
        </button>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="mt-4 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function InvitationLoading() {
  return (
    <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-2xl bg-slate-200" />
  );
}
