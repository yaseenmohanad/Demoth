"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Logo from "@/components/Logo";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInFallback() {
  return (
    <div className="grid h-64 place-items-center text-sm text-[var(--muted)]">
      Loading…
    </div>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(username.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    router.push(next);
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <header className="text-center">
        {/* The logo image already includes the Demoth wordmark, so we
            don't need a sibling text label here. Larger size since
            it's the only brand element on the page. */}
        <Logo size={96} className="mx-auto mb-3" />
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sign in to your account.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[var(--border)]"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Email
          </span>
          <input
            type="text"
            autoComplete="username"
            required
            pattern="[a-zA-Z0-9._+@\-]{3,50}"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-[var(--muted)]">
        New here?{" "}
        <Link
          href={`/sign-up${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-[var(--primary)] hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
