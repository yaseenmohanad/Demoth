"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useAppState, useHydrated, updateProfile, deleteDesign } from "@/lib/store";
import { displayName } from "@/lib/format";
import DesignPreview from "@/components/DesignPreview";
import ConfirmDialog from "@/components/ConfirmDialog";
import Avatar from "@/components/Avatar";
import AvatarCropModal from "@/components/AvatarCropModal";
import PremiumModal from "@/components/PremiumModal";
import AccountSwitcherModal from "@/components/AccountSwitcherModal";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import Logo from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";
import { TrashIcon, UploadIcon } from "@/components/Icons";
import { useRouter } from "next/navigation";

/** Read a File as a data URL so we can hand it to the avatar crop modal. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { profile, designs } = useAppState();
  const hydrated = useHydrated();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [showRemoveAvatarConfirm, setShowRemoveAvatarConfirm] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  /** Original (un-cropped) image data URL while the crop modal is open. */
  const [pendingAvatarSrc, setPendingAvatarSrc] = useState<string | null>(null);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user: authUser, savedAccounts, signOut } = useAuth();
  const router = useRouter();

  async function onAvatarFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      // Open the crop modal so the user can position/zoom/rotate.
      setPendingAvatarSrc(dataUrl);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {hydrated && profile.premium && <Logo size={28} />}
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--primary-strong)]">
              Demoth
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-bold">Your account</h1>
        </div>
        <Link
          href="/admin"
          className="rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--primary)] ring-1 ring-[var(--primary-soft)] hover:bg-[var(--primary)] hover:text-white"
        >
          Admin panel
        </Link>
      </header>

      {/* Profile card */}
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[var(--border)]">
        <div className="mb-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change profile picture"
            className="group relative shrink-0 rounded-full ring-2 ring-transparent transition-all hover:ring-[var(--primary)]"
          >
            <Avatar
              name={hydrated ? profile.name : undefined}
              src={hydrated ? profile.avatar ?? null : null}
              size={72}
            />
            {/* Hover overlay hinting that the avatar is clickable */}
            <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
              <UploadIcon size={22} />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--muted)]">Signed in as</p>
            <p className="truncate text-xl font-bold">
              {hydrated ? profile.name : "…"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-lg bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
              >
                <UploadIcon size={14} />
                {hydrated && profile.avatar ? "Change picture" : "Upload picture"}
              </button>
              {hydrated && profile.avatar && (
                <button
                  type="button"
                  onClick={() => setShowRemoveAvatarConfirm(true)}
                  className="text-xs font-semibold text-[var(--muted)] hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
            {avatarError && (
              <p className="mt-1 text-[11px] text-red-600">{avatarError}</p>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onAvatarFileChosen}
            className="hidden"
          />
        </div>

        {hydrated && (
          <ProfileForm
            initialName={profile.name}
            initialDescription={profile.description}
          />
        )}
      </section>

      {/* Account controls (sign out + switch). Only shown when actually
          signed in — the localStorage-only profile experience doesn't
          have these. */}
      {authUser && (
        <section className="space-y-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[var(--border)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Account
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="flex-1 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
            >
              Switch account
              {savedAccounts.length > 1 && (
                <span className="ml-1 text-[10px] font-bold opacity-70">
                  ({savedAccounts.length})
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSignOutConfirmOpen(true)}
              className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
            >
              Sign out
            </button>
          </div>
          <p className="text-[10px] text-[var(--muted)]">
            Signing out ends this session. Your account is kept on this
            device — pick it again from <strong>Switch account</strong> to
            sign back in without re-entering your password.
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setDeleteAccountOpen(true)}
              className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Delete my account…
            </button>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              Permanently removes your account, designs, and order
              history. You&apos;ll need to type your password.
            </p>
          </div>
        </section>
      )}

      {/* Premium / Settings */}
      {hydrated && !profile.premium && (
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-fuchsia-50 to-violet-50 p-5 shadow-sm ring-1 ring-[var(--border)]">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                Demoth Premium
              </p>
              <p className="text-sm font-bold">Unlock the marketplace & auto-correct</p>
            </div>
            <button
              onClick={() => setPremiumOpen(true)}
              className="shrink-0 rounded-xl bg-gradient-to-r from-amber-400 via-fuchsia-500 to-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:scale-[1.02]"
            >
              Get Premium
            </button>
          </div>
        </section>
      )}

      {hydrated && profile.premium && (
        <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[var(--border)]">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <p className="text-sm font-bold">Premium settings</p>
            <span className="ml-auto rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
              Active
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[var(--background)] p-3 ring-1 ring-[var(--border)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={profile.autoCorrect ?? true}
              onChange={(e) =>
                updateProfile({ autoCorrect: e.target.checked })
              }
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Auto-correct</span>
              <span className="block text-[11px] text-[var(--muted)]">
                Fix common typos while you type and smooth out hand-drawn
                strokes when you finish drawing.
              </span>
            </span>
          </label>

          <button
            onClick={() => {
              if (confirm("Turn premium off? You can re-activate any time.")) {
                updateProfile({ premium: false });
              }
            }}
            className="text-xs text-[var(--muted)] hover:text-red-600"
          >
            Turn premium off
          </button>
        </section>
      )}

      {/* Designs */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Your designs ({hydrated ? designs.length : 0})
          </h2>
          <Link
            href="/design"
            className="text-xs font-semibold text-[var(--primary)] hover:underline"
          >
            + New
          </Link>
        </div>

        {hydrated && designs.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
            You haven&apos;t saved any designs yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {designs.map((d) => {
              const label = displayName(d, designs);
              return (
                <li
                  key={d.id}
                  className="group relative overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-[var(--border)]"
                >
                  <Link href={`/design?id=${d.id}`} className="block">
                    <DesignPreview design={d} className="h-40 w-full" />
                    <p className="mt-2 truncate px-1 text-sm font-semibold">
                      {label}
                    </p>
                    <p className="px-1 text-xs text-[var(--muted)]">
                      {new Date(d.updatedAt).toLocaleDateString()}
                    </p>
                  </Link>
                  <button
                    onClick={() => setPendingDelete({ id: d.id, label })}
                    aria-label="Delete design"
                    className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[var(--muted)] opacity-0 ring-1 ring-[var(--border)] transition-opacity hover:text-red-600 group-hover:opacity-100"
                  >
                    <TrashIcon size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this design?"
        message={
          pendingDelete && (
            <>
              Are you sure you want to delete{" "}
              <strong>&quot;{pendingDelete.label}&quot;</strong>? This
              can&apos;t be undone.
            </>
          )
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteDesign(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={showRemoveAvatarConfirm}
        title="Remove profile picture?"
        message="Your profile will fall back to the default user icon."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          updateProfile({ avatar: undefined });
          setShowRemoveAvatarConfirm(false);
        }}
        onCancel={() => setShowRemoveAvatarConfirm(false)}
      />

      {pendingAvatarSrc && (
        <AvatarCropModal
          src={pendingAvatarSrc}
          onCancel={() => setPendingAvatarSrc(null)}
          onSave={(dataUrl) => {
            updateProfile({ avatar: dataUrl });
            setPendingAvatarSrc(null);
          }}
        />
      )}

      <PremiumModal
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
      />

      <AccountSwitcherModal
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />

      <DeleteAccountModal
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
      />

      <ConfirmDialog
        open={signOutConfirmOpen}
        title="Sign out?"
        message="You'll end this session. Your account stays on this device so you can sign back in from the switcher without re-typing your password."
        confirmLabel="Sign out"
        onConfirm={async () => {
          setSignOutConfirmOpen(false);
          await signOut();
          router.push("/sign-in");
        }}
        onCancel={() => setSignOutConfirmOpen(false)}
      />
    </div>
  );
}

function ProfileForm({
  initialName,
  initialDescription,
}: {
  initialName: string;
  initialDescription: string;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saved, setSaved] = useState(false);

  const dirty = name !== initialName || description !== initialDescription;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateProfile({ name: name.trim() || "Designer", description });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Display name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Description
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="Tell people about your style…"
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
        />
        <span className="mt-1 block text-right text-[10px] text-[var(--muted)]">
          {description.length}/200
        </span>
      </label>

      <button
        type="submit"
        disabled={!dirty}
        className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saved ? "Saved!" : "Save changes"}
      </button>
    </form>
  );
}
