"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Logo from "@/components/Logo";
import {
  validatePassword,
  PASSWORD_RULES_HINT,
} from "@/lib/password-policy";

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
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When the email the user typed was already taken, signUp auto-
   *  appends a suffix and gives us back the final handle. We pause the
   *  redirect on a "your unique handle is…" screen so the user can copy
   *  it down before continuing. */
  const [collisionHandle, setCollisionHandle] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side password policy check — happens before we even hit
    // the network so feedback is instant.
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }

    setSubmitting(true);
    const cleanUsername = username.trim().toLowerCase();
    const { error: signUpErr, finalUsername } = await signUp(
      cleanUsername,
      password,
      name.trim()
    );
    setSubmitting(false);
    if (signUpErr) {
      setError(signUpErr);
      return;
    }
    // With email confirmation off, signUp returns a session directly —
    // no follow-up signIn call needed. The onAuthStateChange listener in
    // auth-context picks up the new session in the background.
    if (finalUsername && finalUsername !== cleanUsername) {
      // Collision — show the user their unique handle before redirecting.
      setCollisionHandle(finalUsername);
      return;
    }
    router.push(next);
  }

  // Collision view: the email they typed was taken, so we generated a
  // suffix for them. Show the final handle prominently and let them
  // continue when ready.
  if (collisionHandle) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <header className="text-center">
          <Logo size={160} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold">You&apos;re in!</h1>
        </header>

        <div className="space-y-3 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-900">
            Heads up — that email was already used by someone else, so we
            added a short suffix to keep your account separate.
          </p>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
              Your sign-in email
            </p>
            <p className="break-all rounded-xl bg-white px-3 py-2 font-mono text-sm ring-1 ring-amber-200">
              {collisionHandle}
            </p>
          </div>
          <p className="text-xs text-amber-900">
            Use this exact handle (with the suffix) when signing in from
            another device. On <strong>this</strong> device you can pick
            your account from the switcher on the Profile page — no need
            to retype it.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push(next)}
          className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)]"
        >
          Got it — continue
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <header className="text-center">
        <Logo size={160} className="mx-auto mb-3" />
        <h1 className="text-3xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick an email and password to get started.
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
            type="text"
            autoComplete="username"
            required
            pattern="[a-zA-Z0-9._+@\-]{3,50}"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
          <span className="mt-1 block text-[10px] text-[var(--muted)]">
            Letters, numbers, dot, underscore, @, +, or hyphen. Doesn&apos;t
            have to be a real email — anything 3-50 chars works.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={64}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
          <span className="mt-1 block text-[10px] text-[var(--muted)]">
            {PASSWORD_RULES_HINT}
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
