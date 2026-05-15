"use client";

import { useEffect } from "react";
import { updateProfile } from "@/lib/store";
import { SparkleIcon, XIcon, CheckIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the user activates premium (e.g. so the caller can
   *  navigate to /other-designs). Activation is free for now — this is
   *  a demo, there's no payment integration. */
  onActivated?: () => void;
}

const FEATURES: { title: string; body: string; ready: boolean }[] = [
  {
    title: "Browse and buy other designers' shirts",
    body: "Open the new Browse tab to see designs from the community and order any of them in one tap.",
    ready: true,
  },
  {
    title: "Auto-correct as you type and smooth drawings",
    body: "Fixes common typos like 'teh' → 'the' while you type. Hand-drawn lines get cleaned up automatically too. Toggle off in Settings if you don't want it.",
    ready: true,
  },
  {
    title: "Edit each other's designs",
    body: "Hop into a friend's design and tweak it together. Coming when accounts ship.",
    ready: false,
  },
  {
    title: "Add friends to view your designs",
    body: "Share a list of approved viewers — only people you've added can see your wardrobe. Coming when accounts ship.",
    ready: false,
  },
];

export default function PremiumModal({ open, onClose, onActivated }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function activate() {
    updateProfile({ premium: true, autoCorrect: true });
    onActivated?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-fuchsia-500 text-white">
            <SparkleIcon size={20} />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
              Demoth Premium
            </p>
            <h3 className="text-xl font-bold">Get Premium</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <XIcon size={18} />
          </button>
        </div>

        <p className="text-sm text-[var(--muted)]">
          Premium unlocks the community marketplace plus a couple of quality-of-life features
          while you design.
        </p>

        <ul className="space-y-2.5">
          {FEATURES.map((f, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-2xl bg-[var(--background)] p-3 ring-1 ring-[var(--border)]"
            >
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  f.ready
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--border)] text-[var(--muted)]"
                }`}
                aria-hidden
              >
                <CheckIcon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {f.title}
                  {!f.ready && (
                    <span className="rounded-full bg-[var(--border)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      Soon
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <button
            onClick={activate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-fuchsia-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.01]"
          >
            <SparkleIcon size={16} />
            Activate Premium (free demo)
          </button>
          <p className="text-center text-[10px] text-[var(--muted)]">
            No payment — this is a school project. You can turn premium off
            anytime from Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
