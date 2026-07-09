"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  validatePassword,
  PASSWORD_RULES_HINT,
} from "@/lib/password-policy";
import { XIcon } from "@/components/Icons";

/**
 * Modal that lets a signed-in user change their password. Flow:
 *   1. Type current password → we verify by re-signing-in with the
 *      user's email + that password. If it fails, we know the current
 *      password was wrong and abort before touching anything.
 *   2. Type new password → validated against the shared password
 *      policy (min 8 chars, upper/digit/symbol required).
 *   3. Type new password again → must match #2 verbatim.
 *   4. Call supabase.auth.updateUser({ password: newPassword }).
 *
 * Nothing is submitted to Supabase until every client-side check
 * passes, so the user gets fast inline feedback for typos / weak
 * passwords without a round-trip.
 */
export default function ResetPasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset form when the modal opens so a previous attempt's fields /
  // errors never linger.
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user?.email) {
      setError("You must be signed in to change your password.");
      return;
    }
    if (!current) {
      setError("Type your current password to confirm.");
      return;
    }
    // Enforce the same policy the sign-up form uses.
    const policyErr = validatePassword(next);
    if (policyErr) {
      setError(policyErr);
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (next === current) {
      setError("New password must be different from the current one.");
      return;
    }

    setSubmitting(true);
    // Step 1: verify current password by re-signing-in with it. That
    // also refreshes the session, which is fine — same user.
    const signInRes = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signInRes.error) {
      setSubmitting(false);
      if (/invalid login credentials/i.test(signInRes.error.message)) {
        setError("Current password is incorrect.");
      } else {
        setError(signInRes.error.message);
      }
      return;
    }
    // Step 2: change the password on the freshly-authed session.
    const updateRes = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);
    if (updateRes.error) {
      setError(updateRes.error.message);
      return;
    }
    setSuccess(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-pw-title"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="reset-pw-title" className="text-lg font-bold">
              Reset password
            </h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Type your current password, then choose a new one.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <XIcon size={18} />
          </button>
        </div>

        {success ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm text-emerald-800 ring-1 ring-emerald-200">
            <p className="font-semibold">Password changed.</p>
            <p className="mt-1 text-xs">
              Use your new password next time you sign in.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <PasswordField
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              autoFocus
            />
            <PasswordField
              label="New password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              hint={PASSWORD_RULES_HINT}
            />
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />

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
              {submitting ? "Saving…" : "Change password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

/** One labelled password input + optional hint, used three times
 *  inside the modal. Extracted here so the form stays scannable. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <input
        type="password"
        required
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
      />
      {hint && (
        <span className="mt-1 block text-[10px] text-[var(--muted)]">
          {hint}
        </span>
      )}
    </label>
  );
}
