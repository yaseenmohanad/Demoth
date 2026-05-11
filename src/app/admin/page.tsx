"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useAppState,
  useHydrated,
  updateOrderStatus,
  deleteOrder,
  resetMockUsers,
} from "@/lib/store";
import { ORDER_PRICE, type DeliveryStatus, type Delivery, type Design } from "@/lib/types";
import { displayName } from "@/lib/format";
import DesignPreview from "@/components/DesignPreview";
import ConfirmDialog from "@/components/ConfirmDialog";
import { TruckIcon, UserIcon, TrashIcon } from "@/components/Icons";

interface OrderRow {
  ownerId: "self" | string;
  ownerName: string;
  order: Delivery;
}

const STATUS_ORDER: DeliveryStatus[] = ["pending", "shipped", "delivered", "cancelled"];

export default function AdminPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const [filter, setFilter] = useState<DeliveryStatus | "all">("all");
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<{
    ownerId: "self" | string;
    orderId: string;
    designName: string;
  } | null>(null);

  const requestDeleteOrder = (
    ownerId: "self" | string,
    orderId: string,
    designName: string
  ) => setPendingDeleteOrder({ ownerId, orderId, designName });

  // Build a unified list of all users (current + mocks) for the profiles section
  const allUsers = useMemo(() => {
    return [
      {
        id: "self" as const,
        name: state.profile.name,
        description: state.profile.description,
        designs: state.designs,
        deliveries: state.deliveries,
      },
      ...state.mockUsers.map((u) => ({
        id: u.id,
        name: u.name,
        description: u.description,
        designs: u.designs,
        deliveries: u.deliveries,
      })),
    ];
  }, [state]);

  // Flat list of all orders across all users
  const allOrders: OrderRow[] = useMemo(() => {
    const rows: OrderRow[] = [];
    for (const u of allUsers) {
      for (const o of u.deliveries) {
        rows.push({
          ownerId: u.id,
          ownerName: u.name,
          order: o,
        });
      }
    }
    return rows.sort((a, b) => b.order.createdAt - a.order.createdAt);
  }, [allUsers]);

  const visibleOrders =
    filter === "all" ? allOrders : allOrders.filter((r) => r.order.status === filter);

  const stats = useMemo(() => {
    const totalOrders = allOrders.length;
    const totalRevenue = allOrders
      .filter((r) => r.order.status !== "cancelled")
      .reduce((s, r) => s + (r.order.price ?? ORDER_PRICE), 0);
    const totalUsers = allUsers.length;
    const totalDesigns = allUsers.reduce((s, u) => s + u.designs.length, 0);
    return { totalOrders, totalRevenue, totalUsers, totalDesigns };
  }, [allOrders, allUsers]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Admin Panel
          </p>
          <h1 className="mt-1 text-3xl font-bold">Manage Demoth</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            View profiles, track all orders, change statuses.
          </p>
        </div>
        <Link
          href="/profile"
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
        >
          Exit
        </Link>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Revenue" value={`$${stats.totalRevenue.toFixed(2)}`} primary />
        <Stat label="Orders" value={hydrated ? stats.totalOrders : 0} />
        <Stat label="Users" value={hydrated ? stats.totalUsers : 0} />
        <Stat label="Designs" value={hydrated ? stats.totalDesigns : 0} />
      </section>

      {/* Profiles */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-[var(--muted)]">
            All profiles ({hydrated ? allUsers.length : 0})
          </h2>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="text-xs text-[var(--muted)] hover:text-[var(--primary)]"
          >
            Reset mocks
          </button>
        </div>
        <ul className="space-y-2">
          {allUsers.map((u) => {
            const open = openProfile === u.id;
            return (
              <li
                key={u.id}
                className="rounded-2xl bg-white shadow-sm ring-1 ring-[var(--border)]"
              >
                <button
                  onClick={() => setOpenProfile(open ? null : u.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                    <UserIcon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {u.name}{" "}
                      {u.id === "self" && (
                        <span className="ml-1 rounded bg-[var(--primary)] px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-white">
                          You
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {u.description || "No description"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 text-[11px] text-[var(--muted)]">
                    <span>{u.designs.length} designs</span>
                    <span>·</span>
                    <span>{u.deliveries.length} orders</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-[var(--border)] px-4 py-4">
                    <UserDetails
                      designs={u.designs}
                      deliveries={u.deliveries}
                      ownerId={u.id}
                      ownerName={u.name}
                      onRequestDelete={requestDeleteOrder}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* All orders */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-[var(--muted)]">
            All orders
          </h2>
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as DeliveryStatus | "all")
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

        {hydrated && visibleOrders.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
            No orders match this filter.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleOrders.map((row) => (
              <OrderRowItem
                key={row.order.id}
                row={row}
                onRequestDelete={requestDeleteOrder}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!pendingDeleteOrder}
        title="Delete this order?"
        message={
          pendingDeleteOrder && (
            <>
              Permanently remove the order for{" "}
              <strong>&quot;{pendingDeleteOrder.designName}&quot;</strong>?
            </>
          )
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDeleteOrder) {
            deleteOrder(
              pendingDeleteOrder.ownerId,
              pendingDeleteOrder.orderId
            );
          }
          setPendingDeleteOrder(null);
        }}
        onCancel={() => setPendingDeleteOrder(null)}
      />

      <ConfirmDialog
        open={showResetConfirm}
        title="Reset mock users?"
        message="This restores Mia, Ravi, and Sky to their seeded designs and orders, undoing any changes you made."
        confirmLabel="Reset"
        onConfirm={() => {
          resetMockUsers();
          setShowResetConfirm(false);
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}

function UserDetails({
  designs,
  deliveries,
  ownerId,
  ownerName,
  onRequestDelete,
}: {
  designs: Design[];
  deliveries: Delivery[];
  ownerId: "self" | string;
  ownerName: string;
  onRequestDelete: (ownerId: "self" | string, orderId: string, designName: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          Designs ({designs.length})
        </p>
        {designs.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No designs.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {designs.map((d) => (
              <div
                key={d.id}
                className="overflow-hidden rounded-xl bg-[var(--background)] p-1 ring-1 ring-[var(--border)]"
              >
                <DesignPreview design={d} className="h-24 w-full" />
                <p className="mt-1 truncate px-1 text-[10px] font-medium">
                  {displayName(d, designs)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          Orders ({deliveries.length})
        </p>
        {deliveries.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No orders.</p>
        ) : (
          <ul className="space-y-1.5">
            {deliveries.map((o) => (
              <OrderRowItem
                key={o.id}
                row={{ ownerId, ownerName, order: o }}
                compact
                onRequestDelete={onRequestDelete}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OrderRowItem({
  row,
  compact,
  onRequestDelete,
}: {
  row: OrderRow;
  compact?: boolean;
  onRequestDelete: (ownerId: "self" | string, orderId: string, designName: string) => void;
}) {
  const { ownerId, ownerName, order } = row;
  const price = order.price ?? ORDER_PRICE;

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl bg-white ring-1 ring-[var(--border)] ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
        <TruckIcon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{order.designName}</p>
        <p className="truncate text-xs text-[var(--muted)]">
          {ownerName} · {new Date(order.createdAt).toLocaleString()} · $
          {price.toFixed(2)}
        </p>
      </div>
      <select
        value={order.status}
        onChange={(e) =>
          updateOrderStatus(ownerId, order.id, e.target.value as DeliveryStatus)
        }
        className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${statusClass(
          order.status
        )}`}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        onClick={() => onRequestDelete(ownerId, order.id, order.designName)}
        aria-label="Delete order"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
      >
        <TrashIcon size={16} />
      </button>
    </li>
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
