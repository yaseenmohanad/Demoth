"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

interface Props {
  /** Where to land after the user clicks the link in their email. */
  next?: string;
  /** Button label — "Email me a sign-in link" vs. "Email me a sign-up link". */
  label: string;
}

/**
 * Sends a one-click sign-in link to the user's email. One component
 * covers both sign-up and sign-in because Supabase's signInWithOtp
 * creates the account on first use and signs in afterwards; the UI
 * doesn't need to know which case is happening.
 */
export default function MagicLinkForm({ next, label }: Props) {
  const { sendMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("sending");
    const { error: err } = await sendMagicLink(email, next);
    if (err) {
      setStatus("idle");
      setError(err);
      return;
    }
    setStatus("sent");
  }

  // Success state — email was dispatched to Supabase. The user needs
  // to leave this screen (to go check their inbox) so there's no next
  // step on this page itself.
  if (status === "sent") {
    return (
      <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
        <p className="text-sm font-semibold text-emerald-900">
          Check your inbox at <strong className="break-all">{email}</strong>.
        </p>
        <p className="mt-2 text-xs text-emerald-900">
          Click the link in the email to finish signing in. Links expire
          after 1 hour. If nothing arrives in a minute or two, check your
          spam folder.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
          }}
          className="mt-3 text-xs font-semibold text-emerald-900 underline hover:no-underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
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
          placeholder="you@gmail.com"
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
        disabled={status === "sending"}
        className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : label}
      </button>
    </form>
  );
}
