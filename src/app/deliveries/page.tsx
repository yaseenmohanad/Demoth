"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppState, useHydrated, addDelivery, makeId } from "@/lib/store";
import { ORDER_PRICE, type DeliveryStatus } from "@/lib/types";
import { displayName } from "@/lib/format";
import { TruckIcon, PlusIcon } from "@/components/Icons";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function DeliveriesPage() {
  const { deliveries, designs } = useAppState();
  const hydrated = useHydrated();
  const [pendingOrder, setPendingOrder] = useState<{
    designId: string;
    designName: string;
  } | null>(null);

  const counts = {
    total: deliveries.length,
    pending: deliveries.filter((d) => d.status === "pending").length,
    shipped: deliveries.filter((d) => d.status === "shipped").length,
    delivered: deliveries.filter((d) => d.status === "delivered").length,
  };
  const totalSpent = deliveries
    .filter((d) => d.status !== "cancelled")
    .reduce((sum, d) => sum + (d.price ?? ORDER_PRICE), 0);

  function placeOrder(designId: string, designName: string) {
    setPendingOrder({ designId, designName });
  }

  function confirmOrder() {
    if (!pendingOrder) return;
    addDelivery({
      id: makeId(),
      designId: pendingOrder.designId,
      designName: pendingOrder.designName,
      status: "pending",
      createdAt: Date.now(),
      price: ORDER_PRICE,
    });
    setPendingOrder(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
          Deliveries
        </p>
        <h1 className="mt-1 text-3xl font-bold">Track your orders</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Real shipping flow comes later — for now you can place mock orders to
          watch the counter grow.
        </p>
      </header>

      {/* Counter cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label="Total" value={hydrated ? counts.total : 0} primary />
        <Counter label="Pending" value={hydrated ? counts.pending : 0} />
        <Counter label="Shipped" value={hydrated ? counts.shipped : 0} />
        <Counter label="Delivered" value={hydrated ? counts.delivered : 0} />
      </section>

      {hydrated && deliveries.length > 0 && (
        <section className="rounded-2xl bg-[var(--primary-soft)] px-4 py-3 text-center text-sm">
          <span className="text-[var(--muted)]">Total spent: </span>
          <span className="font-bold text-[var(--primary-strong)]">
            ${totalSpent.toFixed(2)}
          </span>
        </section>
      )}

      {/* Place an order */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[var(--border)]">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
          Place an order
        </h2>
        {hydrated && designs.length === 0 ? (
          <Link
            href="/design"
            className="flex h-24 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] text-sm text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            Save a design first to order it.
          </Link>
        ) : (
          <ul className="space-y-2">
            {designs.map((d) => {
              const label = displayName(d, designs);
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2"
                >
                  <TruckIcon size={20} className="text-[var(--primary)]" />
                  <span className="truncate text-sm font-medium">{label}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--background)] px-2 py-0.5 text-xs font-bold text-[var(--foreground)]">
                    ${ORDER_PRICE.toFixed(2)}
                  </span>
                  <button
                    onClick={() => placeOrder(d.id, label)}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
                  >
                    <PlusIcon size={14} /> Order
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Order history */}
      <section>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-[var(--muted)]">
          Order history
        </h2>
        {hydrated && deliveries.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
            No deliveries yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {deliveries.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-[var(--border)]"
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                  <TruckIcon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {d.designName}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {new Date(d.createdAt).toLocaleString()} · $
                    {(d.price ?? ORDER_PRICE).toFixed(2)}
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!pendingOrder}
        title={pendingOrder ? `Order "${pendingOrder.designName}"?` : ""}
        message={
          <>
            Total: <strong>${ORDER_PRICE.toFixed(2)}</strong>. We&apos;ll add
            it to your deliveries as <em>pending</em>.
          </>
        }
        confirmLabel="Place order"
        onConfirm={confirmOrder}
        onCancel={() => setPendingOrder(null)}
      />
    </div>
  );
}

function Counter({
  label,
  value,
  primary,
}: {
  label: string;
  value: number;
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
      <p className="text-3xl font-bold">{value}</p>
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

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const map: Record<DeliveryStatus, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
    shipped: { label: "Shipped", className: "bg-blue-100 text-blue-800" },
    delivered: { label: "Delivered", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Cancelled", className: "bg-zinc-200 text-zinc-700" },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      {label}
    </span>
  );
}
