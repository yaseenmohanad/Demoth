"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppState, useHydrated, addDelivery } from "@/lib/store";
import { ORDER_PRICE } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import {
  listPublishedDesigns,
  listingToDesign,
  buyListing,
  type MarketplaceListing,
} from "@/lib/marketplace";
import DesignPreview from "@/components/DesignPreview";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  SparkleIcon,
  PlusIcon,
  TruckIcon,
  SpinnerIcon,
} from "@/components/Icons";

/**
 * Browse — the real marketplace. Reads published designs from Supabase
 * (joined with their author's profile) and lets the signed-in user
 * buy any of them. Buying writes a deliveries row in Supabase + a
 * mirrored local-state delivery so the Deliveries page also reflects
 * the purchase without an extra round-trip.
 *
 * Unsigned users can browse but not buy — we surface a sign-in CTA
 * instead of the buy button in that state.
 */
export default function OtherDesignsPage() {
  const { profile } = useAppState();
  const hydrated = useHydrated();
  const { user: authUser } = useAuth();

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingBuy, setPendingBuy] = useState<MarketplaceListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [bought, setBought] = useState<Set<string>>(new Set());

  // Fetch the marketplace once on mount. We don't subscribe to real-
  // time changes yet — published designs don't churn that fast for a
  // school project — so a manual refresh after publishing is on the
  // user. Browse re-mounts every time it's navigated to anyway.
  useEffect(() => {
    let cancelled = false;
    listPublishedDesigns().then(({ listings: rows, error }) => {
      if (cancelled) return;
      if (error) {
        setLoadError(error);
        setLoading(false);
        return;
      }
      setListings(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmBuy() {
    if (!pendingBuy || buying) return;
    setBuyError(null);
    setBuying(true);
    const { error, localDelivery } = await buyListing(pendingBuy);
    setBuying(false);
    if (error) {
      setBuyError(error);
      return;
    }
    if (localDelivery) {
      // Dual-write the buyer-side copy into localStorage so the
      // Deliveries page (which still reads from the per-user
      // localStorage bucket) shows the order immediately.
      addDelivery(localDelivery);
    }
    setBought((prev) => {
      const next = new Set(prev);
      next.add(pendingBuy.id);
      return next;
    });
    setPendingBuy(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Browse
          </p>
          <h1 className="mt-1 text-3xl font-bold">Other designs</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Shirts designed by other people. ${ORDER_PRICE.toFixed(2)} each.
          </p>
        </div>
        {hydrated && profile.premium && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
            <SparkleIcon size={12} /> Premium
          </span>
        )}
      </header>

      {loading ? (
        <div className="grid place-items-center rounded-2xl bg-white px-4 py-12 text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
          <SpinnerIcon size={24} />
        </div>
      ) : loadError ? (
        <p className="rounded-2xl bg-red-50 px-4 py-8 text-center text-sm text-red-700 ring-1 ring-red-200">
          Couldn&apos;t load the marketplace: {loadError}
        </p>
      ) : listings.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
          Nobody&apos;s published a design yet. Hit{" "}
          <strong>Publish</strong> in the editor to be the first.{" "}
          <Link href="/design" className="text-[var(--primary)] underline">
            Open the editor
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {listings.map((listing) => {
            // Don't sell someone their own design. Show "Your design"
            // instead of the buy button so the marketplace doesn't
            // feel like it's stalking them.
            const isMine = !!authUser && authUser.id === listing.author.id;
            const isBought = bought.has(listing.id);
            return (
              <li
                key={listing.id}
                className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-[var(--border)]"
              >
                <div className="overflow-hidden rounded-xl bg-[var(--background)]">
                  <DesignPreview
                    design={listingToDesign(listing)}
                    className="h-40 w-full"
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 px-1">
                  <Avatar
                    name={listing.author.name}
                    src={listing.author.avatar}
                    size={20}
                  />
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    by {listing.author.name}
                  </p>
                </div>
                <p className="mt-0.5 truncate px-1 text-sm font-semibold">
                  {listing.name || "Untitled design"}
                </p>
                <div className="mt-2 flex items-center gap-2 px-1 pb-1">
                  <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs font-bold">
                    ${ORDER_PRICE.toFixed(2)}
                  </span>
                  {isMine ? (
                    <span className="ml-auto rounded-lg bg-[var(--background)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                      Your design
                    </span>
                  ) : !authUser ? (
                    <Link
                      href="/sign-in?next=/other-designs"
                      className="ml-auto flex items-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--primary-strong)]"
                    >
                      <PlusIcon size={12} /> Sign in to buy
                    </Link>
                  ) : (
                    <button
                      onClick={() => setPendingBuy(listing)}
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
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingBuy}
        title={pendingBuy ? `Buy "${pendingBuy.name || "Untitled"}"?` : ""}
        message={
          pendingBuy && (
            <>
              By <strong>{pendingBuy.author.name}</strong>. Total:{" "}
              <strong>${ORDER_PRICE.toFixed(2)}</strong>.
              {buyError && (
                <span className="mt-2 block rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                  {buyError}
                </span>
              )}
            </>
          )
        }
        confirmLabel={buying ? "Placing…" : "Place order"}
        onConfirm={confirmBuy}
        onCancel={() => {
          setPendingBuy(null);
          setBuyError(null);
        }}
      />
    </div>
  );
}
