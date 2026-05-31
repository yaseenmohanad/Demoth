"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Logo from "@/components/Logo";

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpFallback />}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpFallback() {
  return (
    <div className="grid h-64 place-items-center text-sm text-[var(--muted)]">
      Loading…
    </div>
  );
}

function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { signUp, signIn } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signUpErr } = await signUp(
      email.trim(),
      password,
      name.trim()
    );
    if (signUpErr) {
      setSubmitting(false);
      setError(signUpErr);
      return;
    }
    // With email confirmation off, sign-up auto-creates the session. But
    // defensive: also try signIn in case Supabase didn't return a session.
    const { error: signInErr } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInErr) {
      setError(signInErr);
      return;
    }
    router.push(next);
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <header className="text-center">
        <div className="mx-auto mb-3 inline-flex items-center gap-2">
          <Logo size={32} />
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--primary-strong)]">
            Demoth
          </span>
        </div>
        <h1 className="text-3xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Free, no email confirmation needed.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[var(--border)]"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Display name
          </span>
          <input
            type="text"
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
            placeholder="What should we call you?"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Email
          </span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
          <span className="mt-1 block text-[10px] text-[var(--muted)]">
            At least 6 characters.
          </span>
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
          {submitting ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="text-center text-sm text-[var(--muted)]">
        Already have one?{" "}
        <Link
          href={`/sign-in${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-[var(--primary)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
