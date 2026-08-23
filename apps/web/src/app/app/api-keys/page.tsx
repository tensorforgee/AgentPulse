"use client";

import { FormEvent, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { FirstTraceGuide } from "@/components/first-trace-guide";
import { useWorkspace } from "@/components/workspace-context";
import { requestJson } from "@/lib/client-api";
import type { ApiKeyMetadata, CreatedApiKey } from "@/lib/types";

export default function ApiKeysPage() {
  const { selectedProject } = useWorkspace();
  const [keyResult, setKeyResult] = useState<{
    projectId: string;
    keys: ApiKeyMetadata[];
  }>({ projectId: "", keys: [] });
  const [createdKey, setCreatedKey] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedProject) return;
    let active = true;

    requestJson<ApiKeyMetadata[]>(
      `/api/projects/${selectedProject.id}/api-keys`,
    ).then(
      (keys) => {
        if (active) {
          setKeyResult({ projectId: selectedProject.id, keys });
          setError("");
        }
      },
      (caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load keys");
        }
      },
    );

    return () => {
      active = false;
    };
  }, [selectedProject]);

  const keys =
    selectedProject && keyResult.projectId === selectedProject.id
      ? keyResult.keys
      : [];
  const loading =
    Boolean(selectedProject) && keyResult.projectId !== selectedProject?.id;

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    setSubmitting(true);
    setError("");
    setCreatedKey("");
    try {
      const created = await requestJson<CreatedApiKey>(
        `/api/projects/${selectedProject.id}/api-keys`,
        { method: "POST", body: JSON.stringify({ name }) },
      );
      const { key, ...metadata } = created;
      setCreatedKey(key);
      setKeyResult((current) => ({
        projectId: selectedProject.id,
        keys: [
          metadata,
          ...(current.projectId === selectedProject.id ? current.keys : []),
        ],
      }));
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create key");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeKey(apiKeyId: string) {
    if (!selectedProject) return;
    setError("");
    try {
      const revoked = await requestJson<ApiKeyMetadata>(
        `/api/projects/${selectedProject.id}/api-keys/${apiKeyId}/revoke`,
        { method: "POST" },
      );
      setKeyResult((current) => ({
        ...current,
        keys: current.keys.map((key) => (key.id === revoked.id ? revoked : key)),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke key");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
        Project access
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">API keys</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Machine credentials authenticate telemetry to exactly one project.
        Plaintext is shown once and never stored by AgentPulse.
      </p>

      {!selectedProject ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold">Select a project first</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create or choose a project from the workspace header.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Create key for {selectedProject.name}
            </h2>
            <form
              onSubmit={createKey}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                placeholder="Local SDK"
                aria-label="API key name"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5"
              />
              <button
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting ? "Creating…" : "Create API key"}
              </button>
            </form>
          </section>

          {createdKey ? (
            <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-semibold text-amber-950">Copy this key now</h2>
                  <p className="mt-1 text-sm text-amber-800">
                    This is the only time the raw key is shown. Store it in a
                    password manager or secret manager before continuing.
                  </p>
                </div>
                <CopyButton
                  value={createdKey}
                  label="Copy key"
                  copiedLabel="Key copied"
                  className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-950"
                />
              </div>
              <code className="mt-4 block overflow-x-auto rounded-lg bg-amber-950 p-3 text-sm text-amber-50">
                {createdKey}
              </code>
              <p className="mt-3 text-xs leading-5 text-amber-800">
                AgentPulse stores only a digest and a non-secret display prefix.
                Stored key hashes are never returned to this UI.
              </p>
              <button
                type="button"
                onClick={() => setCreatedKey("")}
                className="mt-3 text-sm font-semibold text-amber-900 underline"
              >
                I have saved it
              </button>
            </section>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-semibold">Project keys</h2>
            </div>
            {loading ? (
              <p className="p-6 text-sm text-slate-500">Loading keys…</p>
            ) : keys.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-medium">No API keys yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Create one above to connect the SDK.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {keys.map((key) => (
                  <article
                    key={key.id}
                    className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{key.name}</h3>
                        <KeyStatus apiKey={key} />
                      </div>
                      <p className="mt-1 font-mono text-sm text-slate-500">
                        {key.prefix}••••••••
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Created {new Date(key.createdAt).toLocaleDateString()}
                        {key.lastUsedAt
                          ? ` · Last used ${new Date(key.lastUsedAt).toLocaleString()}`
                          : " · Never used"}
                      </p>
                    </div>
                    {!key.revokedAt ? (
                      <button
                        type="button"
                        onClick={() => void revokeKey(key.id)}
                        className="self-start rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="mt-6">
            <FirstTraceGuide projectName={selectedProject.name} />
          </div>
        </>
      )}
    </div>
  );
}

function KeyStatus({ apiKey }: { apiKey: ApiKeyMetadata }) {
  const expired = apiKey.expiresAt && new Date(apiKey.expiresAt) <= new Date();
  const label = apiKey.revokedAt ? "Revoked" : expired ? "Expired" : "Active";
  const styles =
    label === "Active"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
