"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Avatar from "./Avatar";
import ConfirmDialog from "./ConfirmDialog";
import { XIcon, PlusIcon, TrashIcon, CheckIcon, SpinnerIcon } from "./Icons";

/**
 * Modal that lists every account signed in on this device and lets the
 * user hop between them, drop one from the list, or jump to /sign-in
 * to add another.
 *
 * Used from the Profile page — opened by the "Switch account" button.
 */
export default function AccountSwitcherModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user, savedAccounts, switchAccount, forgetAccount } = useAuth();
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** When set, we're asking the user to confirm forgetting an account.
   *  Pulled out into its own confirm dialog so we don't depend on the
   *  browser's native confirm() — keeps the UX in-app. */
  const [forgetTarget, setForgetTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSwitch(id: string) {
    if (switching || id === user?.id) return;
    setError(null);
    setSwitching(id);
    const { error: err } = await switchAccount(id);
    setSwitching(null);
    if (err) {
      setError(err);
      return;
    }
    onClose();
    // Reset to the home page after switching so all queries reload
    // with the new user's session.
    router.refresh();
    router.push("/");
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">Switch account</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <XIcon size={18} />
          </button>
        </div>

        {savedAccounts.length === 0 ? (
          <p className="rounded-2xl bg-[var(--background)] p-4 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
            No other accounts on this device yet. Sign in to a different
            account to add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {savedAccounts.map((acc) => {
              const isCurrent = acc.id === user?.id;
              const isSwitching = switching === acc.id;
              return (
                <li
                  key={acc.id}
                  className={`flex items-center gap-3 rounded-2xl p-2 ring-1 ${
                    isCurrent
                      ? "bg-[var(--primary-soft)] ring-[var(--primary)]"
                      : "bg-white ring-[var(--border)] hover:ring-[var(--primary)]"
                  }`}
                >
                  <Avatar name={acc.name} src={acc.avatar} size={40} />
                  <button
                    type="button"
                    onClick={() => handleSwitch(acc.id)}
                    disabled={isCurrent || isSwitching}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <p className="truncate text-sm font-bold">{acc.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {acc.username}
                    </p>
                  </button>

                  {isCurrent ? (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white"
                      title="Currently signed in"
                    >
                      <CheckIcon size={14} />
                    </span>
                  ) : isSwitching ? (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center text-[var(--muted)]"
                      title="Switching…"
                    >
                      <SpinnerIcon size={16} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setForgetTarget({ id: acc.id, name: acc.name })
                      }
                      aria-label={`Forget ${acc.name}`}
                      title="Forget on this device"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <Link
          href="/sign-in"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]"
        >
          <PlusIcon size={16} />
          Add another account
        </Link>

        <p className="text-center text-[10px] text-[var(--muted)]">
          Accounts saved here let you switch without re-entering your
          password. Forgetting an account only removes it from this
          device — the account itself stays in Supabase.
        </p>
      </div>

      <ConfirmDialog
        open={forgetTarget !== null}
        title="Forget this account?"
        message={
          forgetTarget
            ? `"${forgetTarget.name}" will be removed from this device. The account itself stays — sign in again to bring it back to the switcher.`
            : ""
        }
        confirmLabel="Forget"
        onConfirm={() => {
          if (forgetTarget) forgetAccount(forgetTarget.id);
          setForgetTarget(null);
        }}
        onCancel={() => setForgetTarget(null)}
      />
    </div>
  );
}
