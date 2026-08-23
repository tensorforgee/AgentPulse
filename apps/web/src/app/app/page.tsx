"use client";

import { FormEvent, useState } from "react";
import { FirstTraceGuide } from "@/components/first-trace-guide";
import { useWorkspace } from "@/components/workspace-context";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function WorkspacePage() {
  const workspace = useWorkspace();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [showProjectOnboarding, setShowProjectOnboarding] = useState(false);
  const [submitting, setSubmitting] = useState<"organization" | "project" | null>(
    null,
  );

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSubmitting("organization");
    try {
      await workspace.createOrganization({
        name: organizationName,
        slug: organizationSlug || slugify(organizationName),
      });
      setOrganizationName("");
      setOrganizationSlug("");
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Creation failed");
    } finally {
      setSubmitting(null);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSubmitting("project");
    try {
      await workspace.createProject({
        name: projectName,
        slug: projectSlug || slugify(projectName),
        description: projectDescription || undefined,
      });
      setProjectName("");
      setProjectSlug("");
      setProjectDescription("");
      setShowProjectOnboarding(true);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Creation failed");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Welcome to AgentPulse
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Choose an organization and project above, then create a project API
            key to begin sending agent telemetry.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          API connected
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Organizations"
          value={String(workspace.organizations.length)}
          detail={
            workspace.selectedOrganization
              ? `Selected: ${workspace.selectedOrganization.name}`
              : "Create your first workspace"
          }
        />
        <SummaryCard
          label="Projects"
          value={String(workspace.projects.length)}
          detail={
            workspace.selectedProject
              ? `Selected: ${workspace.selectedProject.name}`
              : "No project selected"
          }
        />
        <SummaryCard
          label="Current plan"
          value={workspace.selectedOrganization?.plan ?? "—"}
          detail="Month-1 workspace"
        />
      </section>

      {(workspace.error || formError) && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {formError || workspace.error}
        </p>
      )}

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <SetupCard
          title={
            workspace.organizations.length ? "Add organization" : "First, add an organization"
          }
          description="Organizations keep every project and trace tenant-isolated."
        >
          <form onSubmit={createOrganization} className="space-y-4">
            <Field
              label="Organization name"
              value={organizationName}
              onChange={setOrganizationName}
              placeholder="Acme Agents"
            />
            <Field
              label="Slug"
              value={organizationSlug}
              onChange={setOrganizationSlug}
              placeholder={slugify(organizationName) || "acme-agents"}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
            <button
              disabled={submitting !== null}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting === "organization" ? "Creating…" : "Create organization"}
            </button>
          </form>
        </SetupCard>

        <SetupCard
          title={workspace.projects.length ? "Add project" : "Then, add a project"}
          description={
            workspace.selectedOrganization
              ? `The project will belong to ${workspace.selectedOrganization.name}.`
              : "Select or create an organization to continue."
          }
        >
          <form onSubmit={createProject} className="space-y-4">
            <Field
              label="Project name"
              value={projectName}
              onChange={setProjectName}
              placeholder="Support agent"
              disabled={!workspace.selectedOrganization}
            />
            <Field
              label="Slug"
              value={projectSlug}
              onChange={setProjectSlug}
              placeholder={slugify(projectName) || "support-agent"}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              disabled={!workspace.selectedOrganization}
            />
            <Field
              label="Description (optional)"
              value={projectDescription}
              onChange={setProjectDescription}
              placeholder="Customer support workflow"
              required={false}
              disabled={!workspace.selectedOrganization}
            />
            <button
              disabled={submitting !== null || !workspace.selectedOrganization}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting === "project" ? "Creating…" : "Create project"}
            </button>
          </form>
        </SetupCard>
      </section>

      {showProjectOnboarding && workspace.selectedProject ? (
        <div className="mt-8">
          <FirstTraceGuide projectName={workspace.selectedProject.name} />
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
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
      <p className="mt-3 text-3xl font-semibold capitalize tracking-tight">{value}</p>
      <p className="mt-2 truncate text-sm text-slate-500">{detail}</p>
    </article>
  );
}

function SetupCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-6">{children}</div>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = true,
  disabled = false,
  pattern,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  pattern?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        pattern={pattern}
        maxLength={100}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 shadow-sm disabled:bg-slate-100"
      />
    </label>
  );
}
