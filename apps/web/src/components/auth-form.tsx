"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { requestJson } from "@/lib/client-api";
import type { User } from "@/lib/types";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await requestJson<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          ...(isSignup && displayName.trim() ? { displayName } : {}),
        }),
      });
      router.push("/app");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden bg-[#172033] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          Agent<span className="text-indigo-300">Pulse</span>
        </Link>
        <div className="max-w-xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-indigo-300">
            AI agent observability
          </p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight">
            Understand every run, from first prompt to final tool call.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Trace latency, tokens, cost, and failures across your agent workflows
            in one focused workspace.
          </p>
        </div>
        <p className="text-sm text-slate-400">Built for teams shipping agents.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-12 inline-block text-xl font-semibold tracking-tight lg:hidden"
          >
            Agent<span className="text-indigo-600">Pulse</span>
          </Link>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
            {isSignup ? "Start monitoring" : "Welcome back"}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            {isSignup ? "Create your account" : "Sign in to AgentPulse"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {isSignup
              ? "Create a workspace and instrument your first project."
              : "Continue to your team workspace."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            {isSignup ? (
              <label className="block text-sm font-medium">
                Display name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  maxLength={100}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm transition focus:border-indigo-500"
                  placeholder="Ada Lovelace"
                />
              </label>
            ) : null}
            <label className="block text-sm font-medium">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                required
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm transition focus:border-indigo-500"
                placeholder="you@company.com"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={isSignup ? 12 : undefined}
                required
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm transition focus:border-indigo-500"
                placeholder={isSignup ? "At least 12 characters" : "Your password"}
              />
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? isSignup
                  ? "Creating account…"
                  : "Signing in…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500">
            {isSignup ? "Already have an account?" : "New to AgentPulse?"}{" "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
