"use client";

import { FormEvent, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { useWorkspace } from "@/components/workspace-context";
import { requestJson } from "@/lib/client-api";
import type {
  Organization,
  OrganizationInvite,
  OrganizationMember,
  OrganizationRole,
} from "@/lib/types";

export default function SettingsPage() {
  const organization = useWorkspace().selectedOrganization;
  if (!organization) {
    return (
      <EmptyState message="Select an organization to manage its settings." />
    );
  }
  return (
    <OrganizationSettings
      key={`${organization.id}:${organization.role}`}
      organization={organization}
    />
  );
}

function OrganizationSettings({
  organization,
}: {
  organization: Organization;
}) {
  const workspace = useWorkspace();
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">(
    "member",
  );
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const canManage =
    organization?.role === "owner" || organization?.role === "admin";

  useEffect(() => {
    let active = true;

    const requests: [
      Promise<OrganizationMember[]>,
      Promise<OrganizationInvite[]>,
    ] = [
      requestJson<OrganizationMember[]>(
        `/api/organizations/${organization.id}/members`,
      ),
      canManage
        ? requestJson<OrganizationInvite[]>(
            `/api/organizations/${organization.id}/invites`,
          )
        : Promise.resolve([]),
    ];
    Promise.all(requests).then(
      ([nextMembers, nextInvites]) => {
        if (active) {
          setMembers(nextMembers);
          setInvites(nextInvites);
          setLoading(false);
        }
      },
      (caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load settings",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [canManage, organization]);

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization || !canManage) return;
    setSaving("organization");
    setError("");
    try {
      const updated = await requestJson<Organization>(
        `/api/organizations/${organization.id}`,
        { method: "PATCH", body: JSON.stringify({ name, slug }) },
      );
      workspace.replaceOrganization(updated);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save organization",
      );
    } finally {
      setSaving("");
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization || !canManage) return;
    setSaving("invite");
    setError("");
    setInviteLink("");
    try {
      const result = await requestJson<{
        invite: OrganizationInvite;
        acceptPath: string;
      }>(`/api/organizations/${organization.id}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInvites((current) => [
        result.invite,
        ...current.filter(({ id }) => id !== result.invite.id),
      ]);
      setInviteLink(`${window.location.origin}${result.acceptPath}`);
      setInviteEmail("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create invitation",
      );
    } finally {
      setSaving("");
    }
  }

  async function changeRole(
    member: OrganizationMember,
    role: OrganizationRole,
  ) {
    if (!organization || !canManage) return;
    setSaving(member.id);
    setError("");
    try {
      const updated = await requestJson<OrganizationMember>(
        `/api/organizations/${organization.id}/members/${member.id}`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      );
      setMembers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update role",
      );
    } finally {
      setSaving("");
    }
  }

  async function removeMember(member: OrganizationMember) {
    if (!organization || !canManage) return;
    setSaving(member.id);
    setError("");
    try {
      await requestJson<null>(
        `/api/organizations/${organization.id}/members/${member.id}`,
        { method: "DELETE" },
      );
      setMembers((current) => current.filter(({ id }) => id !== member.id));
      if (member.user.id === workspace.user?.id) {
        await workspace.refreshOrganizations();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not remove member",
      );
    } finally {
      setSaving("");
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!organization || !canManage) return;
    setSaving(inviteId);
    setError("");
    try {
      await requestJson<null>(
        `/api/organizations/${organization.id}/invites/${inviteId}`,
        { method: "DELETE" },
      );
      setInvites((current) => current.filter(({ id }) => id !== inviteId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not revoke invite",
      );
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
        Organization management
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Manage organization identity, members, roles, and pending invitations.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Organization profile</h2>
        {!canManage ? (
          <p className="mt-2 text-sm text-slate-500">
            Your {organization.role} role has read-only access.
          </p>
        ) : null}
        <form
          onSubmit={saveOrganization}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <Field
            label="Name"
            value={name}
            onChange={setName}
            disabled={!canManage}
          />
          <Field
            label="Slug"
            value={slug}
            onChange={setSlug}
            disabled={!canManage}
          />
          {canManage ? (
            <button
              type="submit"
              disabled={Boolean(saving)}
              className="w-fit rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving === "organization" ? "Saving…" : "Save settings"}
            </button>
          ) : null}
        </form>
      </section>

      {canManage ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Invite a member</h2>
          <form
            onSubmit={createInvite}
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_160px_auto]"
          >
            <input
              type="email"
              required
              maxLength={320}
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="teammate@example.com"
              aria-label="Invite email"
              className="rounded-lg border border-slate-300 px-3.5 py-2.5"
            />
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(
                  event.target.value as "admin" | "member" | "viewer",
                )
              }
              aria-label="Invite role"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5"
            >
              {organization.role === "owner" ? (
                <option value="admin">Admin</option>
              ) : null}
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={Boolean(saving)}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving === "invite" ? "Creating…" : "Create invite"}
            </button>
          </form>
          {inviteLink ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                Share this expiring link securely. It is shown only for this
                invitation response.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-white p-2 text-xs">
                  {inviteLink}
                </code>
                <CopyButton
                  value={inviteLink}
                  label="Copy link"
                  copiedLabel="Copied"
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold">Members</h2>
        </div>
        {loading ? (
          <LoadingRows />
        ) : members.length === 0 ? (
          <EmptyState message="No members found." />
        ) : (
          <div className="divide-y divide-slate-200">
            {members.map((member) => {
              const manageable = canManageMember(
                organization.role,
                member.role,
              );
              return (
                <article
                  key={member.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {member.user.displayName ?? member.user.email}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {member.user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {manageable ? (
                      <select
                        value={member.role}
                        disabled={Boolean(saving)}
                        onChange={(event) =>
                          void changeRole(
                            member,
                            event.target.value as OrganizationRole,
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize"
                      >
                        {organization.role === "owner" ? (
                          <>
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                          </>
                        ) : null}
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize text-slate-600">
                        {member.role}
                      </span>
                    )}
                    {manageable ? (
                      <button
                        type="button"
                        disabled={Boolean(saving)}
                        onClick={() => void removeMember(member)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {canManage ? (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold">Pending invitations</h2>
          </div>
          {invites.length === 0 ? (
            <EmptyState message="No pending invitations." />
          ) : (
            <div className="divide-y divide-slate-200">
              {invites.map((invite) => (
                <article
                  key={invite.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">{invite.email}</p>
                    <p className="mt-1 text-sm capitalize text-slate-500">
                      {invite.role} · expires{" "}
                      {new Date(invite.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(saving)}
                    onClick={() => void revokeInvite(invite.id)}
                    className="w-fit rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Revoke
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function canManageMember(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
) {
  if (actorRole === "owner") return true;
  return (
    actorRole === "admin" &&
    (targetRole === "member" || targetRole === "viewer")
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        required
        maxLength={100}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 disabled:bg-slate-100"
      />
    </label>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 p-6" role="status">
      <span className="sr-only">Loading members…</span>
      {[0, 1].map((item) => (
        <div
          key={item}
          className="h-14 animate-pulse rounded-lg bg-slate-100"
        />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center text-sm text-slate-500">{message}</div>
  );
}
