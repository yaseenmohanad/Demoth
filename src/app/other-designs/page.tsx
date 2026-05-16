"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAppState,
  useHydrated,
  addDelivery,
  makeId,
} from "@/lib/store";
import { ORDER_PRICE, type Design, type MockUser } from "@/lib/types";
import { displayName } from "@/lib/format";
import DesignPreview from "@/components/DesignPreview";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import PremiumModal from "@/components/PremiumModal";
import {
  StorefrontIcon,
  SparkleIcon,
  PlusIcon,
  TruckIcon,
} from "@/components/Icons";
import Logo from "@/components/Logo";

interface Listing {
  design: Design;
  seller: MockUser;
}

export default function OtherDesignsPage() {
  const { profile, mockUsers } = useAppState();
  const hydrated = useHydrated();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [pendingBuy, setPendingBuy] = useState<Listing | null>(null);
  const [bought, setBought] = useState<Set<string>>(new Set());

  // Flatten all mock users' designs into a single marketplace feed,
  // newest first.
  const listings: Listing[] = useMemo(() => {
    const rows: Listing[] = [];
    for (const u of mockUsers) {
      for (const d of u.designs) {
        rows.push({ design: d, seller: u });
      }
    }
    rows.sort((a, b) => b.design.updatedAt - a.design.updatedAt);
    return rows;
  }, [mockUsers]);

  function confirmBuy() {
    if (!pendingBuy) return;
    const label = displayName(pendingBuy.design, [pendingBuy.design]);
    addDelivery({
      id: makeId(),
      designId: pendingBuy.design.id,
      designName: `${label} (from ${pendingBuy.seller.name})`,
      status: "pending",
      createdAt: Date.now(),
      price: ORDER_PRICE,
    });
    setBought((prev) => {
      const next = new Set(prev);
      next.add(pendingBuy.design.id);
      return next;
    });
    setPendingBuy(null);
  }

  // ----- not-yet-premium paywall -----
  if (hydrated && !profile.premium) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Browse
          </p>
          <h1 className="mt-1 text-3xl font-bold">Other designs</h1>
        </header>

        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-fuchsia-50 to-violet-50 p-6 text-center shadow-sm ring-1 ring-[var(--border)]">
          <div className="mx-auto flex justify-center">
            <Logo size={64} />
          </div>
          <h2 className="mt-4 text-xl font-bold">Premium only</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">
            Browsing and buying designs from the community is part of
            Demoth Premium. Activate it to unlock this tab plus
            auto-correct while designing.
          </p>
          <button
            onClick={() => setPremiumOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-fuchsia-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02]"
          >
            <SparkleIcon size={16} /> Get Premium
          </button>
        </section>

        <PremiumModal
          open={premiumOpen}
          onClose={() => setPremiumOpen(false)}
        />
      </div>
    );
  }

  // ----- premium marketplace -----
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Browse
          </p>
          <h1 className="mt-1 text-3xl font-bold">Other designs</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Order shirts designed by other people. ${ORDER_PRICE.toFixed(2)} each.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
          <SparkleIcon size={12} /> Premium
        </span>
      </header>

      {!hydrated || listings.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
          No designs from the community yet.{" "}
          <Link href="/" className="text-[var(--primary)] underline">
            Back home
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {listings.map(({ design, seller }) => {
            const label = displayName(design, [design]);
            const isBought = bought.has(design.id);
            return (
              <li
                key={design.id}
                className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-[var(--border)]"
              >
                <div className="overflow-hidden rounded-xl bg-[var(--background)]">
                  <DesignPreview design={design} className="h-40 w-full" />
                </div>
                <div className="mt-2 flex items-center gap-2 px-1">
                  <Avatar name={seller.name} size={20} />
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    by {seller.name}
                  </p>
                </div>
                <p className="mt-0.5 truncate px-1 text-sm font-semibold">
                  {label}
                </p>
                <div className="mt-2 flex items-center gap-2 px-1 pb-1">
                  <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs font-bold">
                    ${ORDER_PRICE.toFixed(2)}
                  </span>
                  <button
                    onClick={() => setPendingBuy({ design, seller })}
                    className="ml-auto flex items-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--primary-strong)]"
                  >
                    {isBought ? (
                      <>
                        <TruckIcon size={12} /> Order again
                      </>
                    ) : (
                      <>
                        <PlusIcon size={12} /> Buy
                      </>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingBuy}
        title={
          pendingBuy
            ? `Buy "${displayName(pendingBuy.design, [pendingBuy.design])}"?`
            : ""
        }
        message={
          pendingBuy && (
            <>
              By <strong>{pendingBuy.seller.name}</strong>. Total:{" "}
              <strong>${ORDER_PRICE.toFixed(2)}</strong>. We&apos;ll add the
              order to your Deliveries.
            </>
          )
        }
        confirmLabel="Place order"
        onConfirm={confirmBuy}
        onCancel={() => setPendingBuy(null)}
      />
    </div>
  );
}
