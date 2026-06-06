"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppState, useHydrated, updateProfile } from "@/lib/store";
import { ArrowLeftIcon, SettingsIcon } from "@/components/Icons";
import Logo from "@/components/Logo";
import AccountSwitcherModal from "@/components/AccountSwitcherModal";
import ConfirmDialog from "@/components/ConfirmDialog";

/**
 * Profile → Settings sub-page. Centralises every "knob" the user can
 * flip about their own account: session controls (switch / sign out)
 * + privacy + premium-gated toggles. The Profile page itself focuses
 * on identity (avatar, display name, bio) and links here for everything
 * else.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { user: authUser, savedAccounts, signOut } = useAuth();
  const { profile } = useAppState();
  const hydrated = useHydrated();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [premiumOffOpen, setPremiumOffOpen] = useState(false);

  // Defaults — see Profile interface comments for the rationale.
  const showOnFriends = profile.showOnFriends ?? true;
  const shareWardrobe = profile.shareWardrobe ?? false;
  const autoCorrect = profile.autoCorrect ?? true;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Link
          href="/profile"
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-white hover:text-[var(--foreground)]"
          aria-label="Back to profile"
        >
          <ArrowLeftIcon size={18} />
        </Link>
        <SettingsIcon size={22} />
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      {/* Account section — always visible. When not currently signed
          in, "Switch account" still works (the modal lists any saved
          accounts on this device and offers an Add-another link), and
          "Sign out" gracefully no-ops + routes to /sign-in. */}
      <Section title="Account">
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl bg-[var(--primary-soft)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
        >
          <span>Switch account</span>
          {savedAccounts.length > 1 && (
            <span className="text-[10px] font-bold opacity-70">
              {savedAccounts.length} on this device
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSignOutOpen(true)}
          className="w-full rounded-2xl bg-white px-3 py-2.5 text-left text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
        >
          {authUser ? "Sign out" : "Go to sign-in"}
        </button>
      </Section>

      <Section title="Privacy">
        <ToggleRow
          label="Show me on Friends"
          description="When on, other people can find you in the Friends directory and send you a friend request. Turn off to be invisible — nobody can request you, but you can still see your existing friends."
          checked={hydrated ? showOnFriends : true}
          onChange={(next) => updateProfile({ showOnFriends: next })}
        />
      </Section>

      {/* Premium-gated toggles. Hidden entirely when premium is off so
          we're not teasing locked features without context. */}
      {hydrated && profile.premium && (
        <Section
          title="Premium"
          headerExtra={
            <span className="rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
              Active
            </span>
          }
          icon={<Logo size={20} />}
        >
          <ToggleRow
            label="Auto-correct"
            description="Fix common typos while you type and smooth out hand-drawn strokes when you finish drawing."
            checked={autoCorrect}
            onChange={(next) => updateProfile({ autoCorrect: next })}
          />
          <ToggleRow
            label="Share my wardrobe with friends"
            description="When on, accepted friends can see your saved designs from your profile in the Friends list."
            checked={shareWardrobe}
            onChange={(next) => updateProfile({ shareWardrobe: next })}
          />
          <button
            type="button"
            onClick={() => setPremiumOffOpen(true)}
            className="text-xs text-[var(--muted)] hover:text-red-600"
          >
            Turn premium off
          </button>
        </Section>
      )}

      <AccountSwitcherModal
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="You'll end this session. Your account stays on this device so you can sign back in from the switcher without re-typing your password."
        confirmLabel="Sign out"
        onConfirm={async () => {
          setSignOutOpen(false);
          await signOut();
          router.push("/sign-in");
        }}
        onCancel={() => setSignOutOpen(false)}
      />

      <ConfirmDialog
        open={premiumOffOpen}
        title="Turn premium off?"
        message="Marketplace browsing, auto-correct and the friends features will stop working. You can re-activate any time."
        confirmLabel="Turn off"
        destructive
        onConfirm={() => {
          setPremiumOffOpen(false);
          updateProfile({ premium: false });
        }}
        onCancel={() => setPremiumOffOpen(false)}
      />
    </div>
  );
}

/** A titled white card used for each settings group. Keeps the page
 *  visually consistent — same outer style for Account / Privacy /
 *  Premium without repeating Tailwind in every section. */
function Section({
  title,
  icon,
  headerExtra,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[var(--border)]">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          {title}
        </p>
        {headerExtra && <div className="ml-auto">{headerExtra}</div>}
      </div>
      {children}
    </section>
  );
}

/** A label + description on the left, a styled checkbox on the right.
 *  Used for every on/off setting on this page. Whole row is clickable
 *  via the wrapping <label>. */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--background)] p-3 ring-1 ring-[var(--border)]">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-[var(--muted)]">
          {description}
        </span>
      </span>
    </label>
  );
}
