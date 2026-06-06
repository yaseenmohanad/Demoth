"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * "Are you sure?" dialog for permanently deleting the signed-in
 * account. Requires the user to re-type their password — that's
 * verified server-side by the `delete_my_account` Postgres RPC before
 * anything is destroyed, so a stolen session alone can't nuke an
 * account.
 *
 * Mounted from the Profile page; renders nothing when `open` is false.
 */
export default function DeleteAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear local state every time the dialog opens so a previous attempt's
  // password / error never leaks into a fresh open.
  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Type your password to confirm.");
      return;
    }
    setSubmitting(true);
    const { error: delErr } = await deleteAccount(password);
    setSubmitting(false);
    if (delErr) {
      setError(delErr);
      return;
    }
    // Account is gone + we're signed out. Send the user to the sign-in
    // page so they can either sign back into a saved account or make a
    // new one.
    onClose();
    router.push("/sign-in");
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl"
      >
        <div>
          <h3 id="delete-account-title" className="text-xl font-bold text-red-700">
            Delete your account?
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            This permanently deletes your account, designs, and order
            history. <strong>It can&apos;t be undone.</strong> Type your
            password to confirm.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
          />
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Deleting…" : "Permanently delete my account"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] ring-1 ring-[var(--border)] hover:bg-[var(--background)]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
