"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  listAllProfiles,
  listAllDeliveries,
  countAllDesigns,
  setDeliveryStatus,
  deleteDelivery,
  type AdminProfile,
  type AdminDelivery,
} from "@/lib/admin";
import type { DeliveryStatus } from "@/lib/types";
import DesignPreview from "@/components/DesignPreview";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import { TruckIcon, TrashIcon, SpinnerIcon } from "@/components/Icons";

/**
 * /admin — real admin panel (Phase 5). Loads every profile + every
 * delivery from Supabase and lets an admin change order statuses or
 * delete orders. Guards on the caller's profiles.is_admin flag; non-
 * admins get a "not allowed" message even though server-side RLS
 * would also block them from reading deliveries that aren't theirs.
 */

const STATUS_ORDER: DeliveryStatus[] = [
  "pending",
  "shipped",
  "delivered",
  "cancelled",
];

/**
 * Lowercase tokens that, when found anywhere in a user's username OR
 * their display name, suppress the @handle line in the admin panel.
 * Substring match so we don't have to know whether the user signed up
 * as `jesterfied`, `jesterfied@gmail.com`, `thejesterfied`, or
 * something with our `-xxxx` collision suffix — any of those hide.
 *
 * The row itself still renders (name, badges, design + order counts,
 * status controls, delete button) — only the @handle is suppressed.
 * False-positive risk is acceptable: another user would have to
 * deliberately put one of these tokens in their handle or display
 * name, which is unlikely for the short distinctive tokens we add.
 */
const HIDDEN_TOKENS = ["jesterfied"];

function isHidden(user: { username: string; name: string }): boolean {
  const u = user.username.toLowerCase();
  const n = user.name.toLowerCase();
  return HIDDEN_TOKENS.some((t) => u.includes(t) || n.includes(t));
}

export default function AdminPage() {
  const router = useRouter();
  const {
    user: authUser,
    profile: authProfile,
    loading: authLoading,
    signOut,
  } = useAuth();
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [deliveries, setDeliveries] = useState<AdminDelivery[]>([]);
  const [designCount, setDesignCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "all">(
    "all"
  );
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminDelivery | null>(null);
  const [mutating, setMutating] = useState<string | null>(null);

  // Admin shortcut mode: if the sign-in page set this flag, allow the
  // panel to render without a real session. Queries may still fail
  // when there's no auth, but the shell + any anon-visible rows still
  // show. Read from sessionStorage inside an effect so SSR doesn't
  // touch window.
  const [shortcutMode, setShortcutMode] = useState(false);
  useEffect(() => {
    try {
      setShortcutMode(
        typeof window !== "undefined" &&
          sessionStorage.getItem("demoth-admin-shortcut") === "1"
      );
    } catch {
      /* private mode */
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, d, c] = await Promise.all([
      listAllProfiles(),
      listAllDeliveries(),
      countAllDesigns(),
    ]);
    setError(p.error ?? d.error ?? c.error);
    setProfiles(p.profiles);
    setDeliveries(d.deliveries);
    setDesignCount(c.count);
    setLoading(false);
  }, []);

  // Derived data — MUST be declared before any early-return gates so
  // React's hook ordering stays stable across the gate transitions.
  const stats = useMemo(() => {
    const totalRevenue = deliveries
      .filter((d) => d.status !== "cancelled")
      .reduce((s, d) => s + d.price, 0);
    return {
      totalRevenue,
      totalOrders: deliveries.length,
      totalUsers: profiles.length,
      totalDesigns: designCount,
    };
  }, [deliveries, profiles, designCount]);

  useEffect(() => {
    const allowed =
      shortcutMode || (!!authUser && !!authProfile?.is_admin);
    if (!allowed) return;
    void refresh();
  }, [authUser, authProfile, shortcutMode, refresh]);

  // ----- access gates ------------------------------------------------------

  if (authLoading) {
    return (
      <div className="grid place-items-center rounded-2xl bg-white px-4 py-12 text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
        <SpinnerIcon size={24} />
      </div>
    );
  }

  // In shortcut mode we skip both "not signed in" and "not admin"
  // gates — the user typed the magic email in sign-in, they get in.
  if (!shortcutMode && !authUser) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Admin panel</h1>
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
          Sign in with an admin account to manage Demoth.
        </p>
        <Link
          href="/sign-in?next=/admin"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!shortcutMode && !authProfile?.is_admin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Admin panel</h1>
        <p className="rounded-2xl bg-red-50 p-6 text-center text-sm text-red-700 ring-1 ring-red-200">
          You aren&apos;t an admin. If you should be, ask whoever set up the
          Supabase project to run{" "}
          <code className="rounded bg-white px-1 py-0.5 text-xs">
            update public.profiles set is_admin = true where id = &apos;
            {authUser?.id ?? "your-user-id"}&apos;;
          </code>{" "}
          in the SQL Editor.
        </p>
      </div>
    );
  }

  // ----- mutations --------------------------------------------------------

  async function handleStatusChange(id: string, status: DeliveryStatus) {
    setMutating(id);
    const { error: e } = await setDeliveryStatus(id, status);
    setMutating(null);
    if (e) {
      setError(e);
      return;
    }
    // Optimistic local update so the UI feels snappy.
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d))
    );
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setMutating(pendingDelete.id);
    const { error: e } = await deleteDelivery(pendingDelete.id);
    setMutating(null);
    if (e) {
      setError(e);
      setPendingDelete(null);
      return;
    }
    setDeliveries((prev) => prev.filter((d) => d.id !== pendingDelete.id));
    setPendingDelete(null);
  }

  // ----- derived data -----------------------------------------------------

  const visibleDeliveries =
    statusFilter === "all"
      ? deliveries
      : deliveries.filter((d) => d.status === statusFilter);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Admin Panel
          </p>
          <h1 className="mt-1 text-3xl font-bold">Manage Demoth</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Real users, real orders. Change statuses or delete bad data.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            // Both leave-the-panel paths need to clear the shortcut
            // flag; a real signed-in admin also gets a full sign-out.
            try {
              sessionStorage.removeItem("demoth-admin-shortcut");
            } catch {
              /* private mode */
            }
            if (authUser) {
              await signOut();
            }
            router.push("/sign-in");
          }}
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
        >
          Sign out
        </button>
      </header>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Revenue"
          value={`$${stats.totalRevenue.toFixed(2)}`}
          primary
        />
        <Stat label="Orders" value={loading ? "…" : stats.totalOrders} />
        <Stat label="Users" value={loading ? "…" : stats.totalUsers} />
        <Stat label="Designs" value={loading ? "…" : stats.totalDesigns} />
      </section>

      {/* Profiles */}
      <section>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-[var(--muted)]">
          All profiles ({loading ? "…" : profiles.length})
        </h2>
        {loading ? (
          <Loading />
        ) : profiles.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
            No profiles yet — nobody has signed up.
          </p>
        ) : (
          <ul className="space-y-2">
            {profiles.map((u) => {
              const open = openProfile === u.id;
              const myDeliveries = deliveries.filter(
                (d) => d.buyer.id === u.id
              );
              return (
                <li
                  key={u.id}
                  className="rounded-2xl bg-white shadow-sm ring-1 ring-[var(--border)]"
                >
                  <button
                    onClick={() => setOpenProfile(open ? null : u.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <Avatar name={u.name} src={u.avatar} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {u.name}
                        {u.id === authUser?.id && (
                          <span className="ml-1 rounded bg-[var(--primary)] px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-white">
                            You
                          </span>
                        )}
                        {u.isAdmin && (
                          <span className="ml-1 rounded bg-amber-500 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-white">
                            Admin
                          </span>
                        )}
                        {u.premium && (
                          <span className="ml-1 rounded bg-fuchsia-500 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-white">
                            Premium
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {isHidden(u) ? (
                          <span className="italic">email hidden</span>
                        ) : (
                          `@${u.username}`
                        )}
                        {u.description && ` · ${u.description}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 text-[11px] text-[var(--muted)]">
                      <span>{u.designCount} designs</span>
                      <span>·</span>
                      <span>{u.deliveryCount} orders</span>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-[var(--border)] px-4 py-4">
                      <UserOrders
                        orders={myDeliveries}
                        onChangeStatus={handleStatusChange}
                        onDelete={(d) => setPendingDelete(d)}
                        mutatingId={mutating}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* All orders */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-[var(--muted)]">
            All orders
          </h2>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as DeliveryStatus | "all")
            }
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <Loading />
        ) : visibleDeliveries.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
            No orders match this filter.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleDeliveries.map((d) => (
              <DeliveryRow
                key={d.id}
                row={d}
                onChangeStatus={handleStatusChange}
                onDelete={(row) => setPendingDelete(row)}
                mutating={mutating === d.id}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this order?"
        message={
          pendingDelete && (
            <>
              Permanently remove the order for{" "}
              <strong>&quot;{pendingDelete.designName}&quot;</strong> by{" "}
              <strong>{pendingDelete.buyer.name}</strong>?
            </>
          )
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// ---- subcomponents -------------------------------------------------------

function UserOrders({
  orders,
  onChangeStatus,
  onDelete,
  mutatingId,
}: {
  orders: AdminDelivery[];
  onChangeStatus: (id: string, status: DeliveryStatus) => void;
  onDelete: (row: AdminDelivery) => void;
  mutatingId: string | null;
}) {
  if (orders.length === 0) {
    return (
      <p className="text-xs text-[var(--muted)]">
        This user hasn&apos;t placed any orders.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <DeliveryRow
          key={o.id}
          row={o}
          compact
          onChangeStatus={onChangeStatus}
          onDelete={onDelete}
          mutating={mutatingId === o.id}
        />
      ))}
    </ul>
  );
}

function DeliveryRow({
  row,
  compact,
  onChangeStatus,
  onDelete,
  mutating,
}: {
  row: AdminDelivery;
  compact?: boolean;
  onChangeStatus: (id: string, status: DeliveryStatus) => void;
  onDelete: (row: AdminDelivery) => void;
  mutating: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl bg-white ring-1 ring-[var(--border)] ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      {/* Thumbnail (real design preview when we have the data, else
          a generic truck icon). */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[var(--background)]">
        {row.design ? (
          <DesignPreview design={row.design} className="h-full w-full" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[var(--muted)]">
            <TruckIcon size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.designName}</p>
        <p className="truncate text-[11px] text-[var(--muted)]">
          Buyer: {row.buyer.name}
          {row.designer && ` · Designer: ${row.designer.name}`} ·{" "}
          {new Date(row.createdAt).toLocaleString()} · $
          {row.price.toFixed(2)}
        </p>
      </div>
      <select
        value={row.status}
        disabled={mutating}
        onChange={(e) =>
          onChangeStatus(row.id, e.target.value as DeliveryStatus)
        }
        className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50 ${statusClass(
          row.status
        )}`}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        onClick={() => onDelete(row)}
        disabled={mutating}
        aria-label="Delete order"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        <TrashIcon size={16} />
      </button>
    </li>
  );
}

function Stat({
  label,
  value,
  primary,
}: {
  label: string;
  value: string | number;
  primary?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-4 text-center ring-1 ${
        primary
          ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
          : "bg-white text-[var(--foreground)] ring-[var(--border)]"
      }`}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p
        className={`text-[10px] uppercase tracking-wider ${
          primary ? "text-white/80" : "text-[var(--muted)]"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center rounded-2xl bg-white px-4 py-10 ring-1 ring-[var(--border)]">
      <SpinnerIcon size={24} />
    </div>
  );
}

function statusClass(status: DeliveryStatus) {
  switch (status) {
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "shipped":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "delivered":
      return "border-green-200 bg-green-50 text-green-800";
    case "cancelled":
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
  }
}

