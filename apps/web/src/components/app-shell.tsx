"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useWorkspace } from "@/components/workspace-context";

const navigation = [
  { href: "/app", label: "Workspace", exact: true },
  { href: "/app/runs", label: "Runs", exact: false },
  { href: "/app/api-keys", label: "API keys", exact: false },
  { href: "/app/settings", label: "Settings", exact: false },
  { href: "/app/billing", label: "Billing", exact: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const workspace = useWorkspace();

  if (workspace.loading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="mt-4 text-sm text-slate-500">Loading your workspace…</p>
        </div>
      </main>
    );
  }

  if (!workspace.user) return null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="border-b border-slate-800 bg-[#172033] px-5 py-5 text-white lg:min-h-screen lg:border-b-0">
        <div className="flex items-center justify-between lg:block">
          <Link href="/app" className="text-xl font-semibold tracking-tight">
            Agent<span className="text-indigo-300">Pulse</span>
          </Link>
          <span className="rounded-full bg-indigo-400/15 px-2.5 py-1 text-xs font-medium text-indigo-200">
            V1
          </span>
        </div>
        <nav
          aria-label="Primary navigation"
          className="mt-5 flex gap-2 overflow-x-auto lg:mt-10 lg:block lg:space-y-2 lg:overflow-visible"
        >
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href) ||
                (item.href === "/app/runs" &&
                  pathname.startsWith("/app/traces/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Organization
                <select
                  value={workspace.selectedOrganization?.id ?? ""}
                  onChange={(event) =>
                    void workspace.selectOrganization(event.target.value)
                  }
                  className="mt-1.5 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 sm:min-w-52"
                >
                  {workspace.organizations.length === 0 ? (
                    <option value="">No organizations</option>
                  ) : null}
                  {workspace.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name} · {organization.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Project
                <select
                  value={workspace.selectedProject?.id ?? ""}
                  disabled={
                    !workspace.selectedOrganization || workspace.loadingProjects
                  }
                  aria-busy={workspace.loadingProjects}
                  onChange={(event) =>
                    workspace.selectProject(event.target.value)
                  }
                  className="mt-1.5 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 disabled:bg-slate-100 sm:min-w-52"
                >
                  {workspace.projects.length === 0 ? (
                    <option value="">
                      {workspace.loadingProjects ? "Loading…" : "No projects"}
                    </option>
                  ) : null}
                  {workspace.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-4 xl:justify-end">
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-semibold">
                  {workspace.user.displayName ?? "AgentPulse user"}
                </p>
                <p
                  className="truncate text-xs text-slate-500"
                  title={workspace.user.email}
                >
                  {workspace.user.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void workspace.logout()}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold transition hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="p-5 sm:p-8">
          {workspace.error ? (
            <p
              role="alert"
              className="mx-auto mb-6 max-w-7xl break-words rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {workspace.error}
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
