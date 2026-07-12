"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useAppState,
  useHydrated,
  updateProfile,
  saveDesign,
  deleteDesign,
} from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { publishDesign, unpublishDesign } from "@/lib/marketplace";
import { displayName } from "@/lib/format";
import type { Design } from "@/lib/types";
import {
  ArrowLeftIcon,
  SettingsIcon,
  UserIcon,
  EyeIcon,
  BrushIcon,
  StorefrontIcon,
  UploadIcon,
  CheckIcon,
  TrashIcon,
} from "@/components/Icons";
import Logo from "@/components/Logo";
import DesignPreview from "@/components/DesignPreview";
import AccountSwitcherModal from "@/components/AccountSwitcherModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import ResetPasswordModal from "@/components/ResetPasswordModal";

/**
 * Mirror a privacy/wardrobe toggle to the Supabase profiles row when
 * the user's signed in. Fire-and-forget — the local write is source
 * of truth for guests, and a network blip doesn't visibly fail the
 * toggle.
 */
function pushProfileFlagToDb(
  userId: string | undefined,
  patch: Record<string, unknown>
) {
  if (!userId) return;
  void supabase.from("profiles").update(patch).eq("id", userId);
}

// ---- Preset backgrounds -----------------------------------------------------
// Pure CSS gradients so we don't ship image files. Each preset stores a
// full CSS `background-image` value into profile.bgImage. Falls back to
// the palette defaults if the user picks "None".
interface Preset {
  id: string;
  label: string;
  value: string; // CSS background-image string
}
const PRESET_BACKGROUNDS: Preset[] = [
  {
    id: "grad-violet",
    label: "Violet dream",
    value: "linear-gradient(135deg, #c4b5fd 0%, #f9a8d4 100%)",
  },
  {
    id: "grad-sunset",
    label: "Sunset",
    value: "linear-gradient(135deg, #fbbf24 0%, #f472b6 50%, #a78bfa 100%)",
  },
  {
    id: "grad-mint",
    label: "Mint sky",
    value: "linear-gradient(135deg, #a7f3d0 0%, #7dd3fc 100%)",
  },
  {
    id: "grad-charcoal",
    label: "Charcoal",
    value: "linear-gradient(135deg, #1c1730 0%, #4c1d95 100%)",
  },
];

// ---- Tab config ------------------------------------------------------------
type TabId = "account" | "privacy" | "looks" | "clothes" | "premium";

interface Tab {
  id: TabId;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  premiumOnly?: boolean;
}
const TABS: Tab[] = [
  { id: "account", label: "Account", Icon: UserIcon },
  { id: "privacy", label: "Privacy", Icon: EyeIcon },
  { id: "looks", label: "Looks", Icon: BrushIcon },
  { id: "clothes", label: "Clothes", Icon: StorefrontIcon },
  { id: "premium", label: "Premium", Icon: SettingsIcon, premiumOnly: true },
];

// ---- Page --------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const { user: authUser, savedAccounts, signOut } = useAuth();
  const { profile, designs, deliveries } = useAppState();
  const hydrated = useHydrated();

  const [tab, setTab] = useState<TabId>("account");

  // Shared modal state — sits at the top level so any tab can open
  // them without prop-drilling.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [premiumOffOpen, setPremiumOffOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState<Design | null>(null);

  const visibleTabs = TABS.filter(
    (t) => !t.premiumOnly || (hydrated && profile.premium)
  );

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

      <div className="flex flex-col gap-4 md:flex-row">
        {/* Sidebar / top-strip nav */}
        <nav className="flex md:w-44 md:flex-shrink-0 md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
          {visibleTabs.map((t) => {
            const active = tab === t.id;
            const Icon = t.Icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-semibold ring-1 transition-colors ${
                  active
                    ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                    : "bg-white text-[var(--muted)] ring-[var(--border)] hover:text-[var(--foreground)]"
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Main pane */}
        <div className="min-w-0 flex-1 space-y-4">
          {tab === "account" && (
            <AccountTab
              signedIn={!!authUser}
              savedCount={savedAccounts.length}
              onSwitch={() => setSwitcherOpen(true)}
              onSignOut={() => setSignOutOpen(true)}
              onResetPw={() => setResetPwOpen(true)}
            />
          )}
          {tab === "privacy" && (
            <PrivacyTab
              hydrated={hydrated}
              showOnFriends={profile.showOnFriends ?? true}
              authUserId={authUser?.id}
            />
          )}
          {tab === "looks" && (
            <LooksTab
              hydrated={hydrated}
              theme={profile.theme ?? "light"}
              bgColor={profile.bgColor}
              bgImage={profile.bgImage}
              authUserId={authUser?.id}
            />
          )}
          {tab === "clothes" && (
            <ClothesTab
              designs={designs}
              deliveries={deliveries}
              onRequestPublish={(d) => setPublishConfirm(d)}
              onUnpublish={async (d) => {
                if (!d.publishedId) return;
                await unpublishDesign(d.publishedId);
                saveDesign({ ...d, isPublished: false });
              }}
              onDelete={(id) => deleteDesign(id)}
            />
          )}
          {tab === "premium" && hydrated && profile.premium && (
            <PremiumTab
              autoCorrect={profile.autoCorrect ?? true}
              shareWardrobe={profile.shareWardrobe ?? false}
              authUserId={authUser?.id}
              onTurnOff={() => setPremiumOffOpen(true)}
            />
          )}
        </div>
      </div>

      <AccountSwitcherModal
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
      <ResetPasswordModal
        open={resetPwOpen}
        onClose={() => setResetPwOpen(false)}
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
      <ConfirmDialog
        open={!!publishConfirm}
        title="List this design in Browse?"
        message={
          publishConfirm ? (
            <>
              <strong>&quot;{publishConfirm.name || "Untitled"}&quot;</strong>{" "}
              will appear in <strong>Browse</strong> for everyone, and any
              signed-in user can buy it for $9.00. You can unlist it any
              time from here.
            </>
          ) : null
        }
        confirmLabel="Yes, list it"
        onConfirm={async () => {
          if (!publishConfirm) return;
          const d = publishConfirm;
          setPublishConfirm(null);
          const { publishedId, error } = await publishDesign(d);
          if (error) {
            // eslint-disable-next-line no-alert
            alert(error);
            return;
          }
          saveDesign({
            ...d,
            publishedId: publishedId ?? d.publishedId,
            isPublished: true,
          });
        }}
        onCancel={() => setPublishConfirm(null)}
      />
    </div>
  );
}

// ---- Section wrapper --------------------------------------------------------

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

// ---- Account tab ------------------------------------------------------------

function AccountTab({
  signedIn,
  savedCount,
  onSwitch,
  onSignOut,
  onResetPw,
}: {
  signedIn: boolean;
  savedCount: number;
  onSwitch: () => void;
  onSignOut: () => void;
  onResetPw: () => void;
}) {
  return (
    <Section title="Account">
      <button
        type="button"
        onClick={onSwitch}
        className="flex w-full items-center justify-between rounded-2xl bg-[var(--primary-soft)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
      >
        <span>Switch account</span>
        {savedCount > 1 && (
          <span className="text-[10px] font-bold opacity-70">
            {savedCount} on this device
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-2xl bg-white px-3 py-2.5 text-left text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
      >
        {signedIn ? "Sign out" : "Go to sign-in"}
      </button>
      {signedIn && (
        <button
          type="button"
          onClick={onResetPw}
          className="w-full rounded-2xl bg-white px-3 py-2.5 text-left text-sm font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
        >
          Reset password
        </button>
      )}
    </Section>
  );
}

// ---- Privacy tab ------------------------------------------------------------

function PrivacyTab({
  hydrated,
  showOnFriends,
  authUserId,
}: {
  hydrated: boolean;
  showOnFriends: boolean;
  authUserId?: string;
}) {
  return (
    <Section title="Privacy">
      <ToggleRow
        label="Show me on Friends"
        description="When on, other people can find you in the Friends directory and send you a friend request. Turn off to be invisible — nobody can request you, but you can still see your existing friends."
        checked={hydrated ? showOnFriends : true}
        onChange={(next) => {
          updateProfile({ showOnFriends: next });
          pushProfileFlagToDb(authUserId, { show_on_friends: next });
        }}
      />
    </Section>
  );
}

// ---- Looks tab --------------------------------------------------------------

function LooksTab({
  hydrated,
  theme,
  bgColor,
  bgImage,
  authUserId,
}: {
  hydrated: boolean;
  theme: "light" | "dark";
  bgColor?: string;
  bgImage?: string;
  authUserId?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setTheme = useCallback(
    (t: "light" | "dark") => {
      updateProfile({ theme: t });
      pushProfileFlagToDb(authUserId, { theme: t });
    },
    [authUserId]
  );

  const setBgColor = useCallback(
    (c: string | undefined) => {
      // Clear image when a color is picked so the two aren't fighting.
      updateProfile({ bgColor: c, bgImage: undefined });
      pushProfileFlagToDb(authUserId, {
        bg_color: c ?? null,
        bg_image: null,
      });
    },
    [authUserId]
  );

  const setBgImage = useCallback(
    (img: string | undefined) => {
      updateProfile({ bgImage: img, bgColor: undefined });
      pushProfileFlagToDb(authUserId, {
        bg_image: img ?? null,
        bg_color: null,
      });
    },
    [authUserId]
  );

  const clearBg = useCallback(() => {
    updateProfile({ bgColor: undefined, bgImage: undefined });
    pushProfileFlagToDb(authUserId, { bg_color: null, bg_image: null });
  }, [authUserId]);

  async function handleUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      if (typeof url === "string") {
        // Store as a full CSS background-image value so LooksApplier
        // can slot it straight into body.style.backgroundImage — same
        // shape as the preset gradients.
        setBgImage(`url("${url}")`);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <>
      <Section title="Theme">
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`flex-1 rounded-2xl px-3 py-3 text-sm font-semibold capitalize ring-1 transition-colors ${
                (hydrated ? theme : "light") === t
                  ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                  : "bg-white text-[var(--muted)] ring-[var(--border)] hover:text-[var(--foreground)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Background">
        <p className="text-[11px] text-[var(--muted)]">
          Pick a color, a preset, or upload your own image. Only affects
          your view.
        </p>

        {/* Color picker + Reset */}
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={bgColor ?? "#f7f5fb"}
            onChange={(e) => setBgColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-white"
            aria-label="Pick a background color"
          />
          <span className="text-xs text-[var(--muted)]">
            {bgColor ? bgColor : "No color set"}
          </span>
          <button
            type="button"
            onClick={clearBg}
            className="ml-auto rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-red-600"
          >
            Reset
          </button>
        </div>

        {/* Preset gradients */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Presets
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESET_BACKGROUNDS.map((p) => {
              const selected = bgImage === p.value;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setBgImage(p.value)}
                  className={`group relative aspect-square overflow-hidden rounded-2xl ring-2 transition-all ${
                    selected
                      ? "ring-[var(--primary)]"
                      : "ring-transparent hover:ring-[var(--primary-soft)]"
                  }`}
                  style={{ backgroundImage: p.value }}
                  aria-label={p.label}
                  title={p.label}
                >
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-[var(--primary)]">
                      <CheckIcon size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Upload */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Custom image
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleUpload(f);
            }}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-2xl bg-[var(--primary-soft)] px-3 py-2 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
            >
              <UploadIcon size={16} />
              Upload image
            </button>
            {bgImage && !PRESET_BACKGROUNDS.some((p) => p.value === bgImage) && (
              <span className="text-xs text-[var(--muted)]">
                Custom image set
              </span>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

// ---- Clothes tab ------------------------------------------------------------

function ClothesTab({
  designs,
  deliveries,
  onRequestPublish,
  onUnpublish,
  onDelete,
}: {
  designs: Design[];
  deliveries: { id: string; designName: string; status: string; createdAt: number; price?: number }[];
  onRequestPublish: (d: Design) => void;
  onUnpublish: (d: Design) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <Section title={`Your designs (${designs.length})`}>
        {designs.length === 0 ? (
          <p className="rounded-2xl bg-[var(--background)] px-3 py-4 text-center text-xs text-[var(--muted)] ring-1 ring-[var(--border)]">
            No designs yet.{" "}
            <Link href="/design" className="text-[var(--primary)] underline">
              Start one
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {designs.map((d) => {
              const listed = !!d.isPublished;
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-2xl bg-[var(--background)] p-2 ring-1 ring-[var(--border)]"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
                    <DesignPreview design={d} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {displayName(d, designs)}
                    </p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {listed ? "Listed in Browse" : "Not listed"}
                    </p>
                  </div>
                  {listed ? (
                    <button
                      type="button"
                      onClick={() => void onUnpublish(d)}
                      className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                    >
                      Unlist
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRequestPublish(d)}
                      className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--primary-strong)]"
                    >
                      List
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(d.id)}
                    aria-label="Delete design"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Clothes you ordered (${deliveries.length})`}>
        {deliveries.length === 0 ? (
          <p className="rounded-2xl bg-[var(--background)] px-3 py-4 text-center text-xs text-[var(--muted)] ring-1 ring-[var(--border)]">
            No orders yet.{" "}
            <Link
              href="/other-designs"
              className="text-[var(--primary)] underline"
            >
              Browse
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {deliveries.slice(0, 20).map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-2xl bg-[var(--background)] p-3 ring-1 ring-[var(--border)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {o.designName}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {new Date(o.createdAt).toLocaleDateString()} · $
                    {(o.price ?? 9).toFixed(2)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusPill(o.status)}`}
                >
                  {o.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="People who bought your clothes">
        <p className="rounded-2xl bg-[var(--background)] px-3 py-4 text-center text-xs text-[var(--muted)] ring-1 ring-[var(--border)]">
          Coming soon — needs a small database policy change to let
          designers see who ordered their listings.
        </p>
      </Section>
    </>
  );
}

function statusPill(s: string): string {
  switch (s) {
    case "pending":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    case "shipped":
      return "bg-blue-50 text-blue-800 ring-1 ring-blue-200";
    case "delivered":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "cancelled":
      return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
    default:
      return "bg-white text-[var(--muted)] ring-1 ring-[var(--border)]";
  }
}

// ---- Premium tab ------------------------------------------------------------

function PremiumTab({
  autoCorrect,
  shareWardrobe,
  authUserId,
  onTurnOff,
}: {
  autoCorrect: boolean;
  shareWardrobe: boolean;
  authUserId?: string;
  onTurnOff: () => void;
}) {
  return (
    <Section
      title="Premium"
      icon={<Logo size={18} />}
      headerExtra={
        <span className="rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
          Active
        </span>
      }
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
        onChange={(next) => {
          updateProfile({ shareWardrobe: next });
          pushProfileFlagToDb(authUserId, { share_wardrobe: next });
        }}
      />
      <button
        type="button"
        onClick={onTurnOff}
        className="text-xs text-[var(--muted)] hover:text-red-600"
      >
        Turn premium off
      </button>
    </Section>
  );
}
