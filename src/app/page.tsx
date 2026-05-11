"use client";

import Link from "next/link";
import { useAppState, useHydrated } from "@/lib/store";
import { displayName } from "@/lib/format";
import DesignPreview from "@/components/DesignPreview";
import { BrushIcon, TruckIcon, PlusIcon } from "@/components/Icons";

export default function HomePage() {
  const { profile, designs, deliveries } = useAppState();
  const hydrated = useHydrated();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
          Dashboard
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight">
          Hello, {hydrated ? profile.name : "there"}!
          <br />
          Design your style.
        </h1>
      </header>

      {/* Wardrobe */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Wardrobe
          </h2>
          <Link
            href="/profile"
            className="text-xs font-semibold text-[var(--primary)] hover:underline"
          >
            View all
          </Link>
        </div>

        {hydrated && designs.length === 0 ? (
          <EmptyWardrobe />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {designs.slice(0, 8).map((d) => (
              <Link
                key={d.id}
                href={`/design?id=${d.id}`}
                className="group relative flex-shrink-0"
              >
                <div className="h-36 w-28 overflow-hidden rounded-2xl border-2 border-[var(--primary-soft)] bg-white p-1 transition-colors group-hover:border-[var(--primary)]">
                  <DesignPreview design={d} className="h-full w-full" />
                </div>
                <p className="mt-1 line-clamp-1 px-1 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
                  {displayName(d, designs)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Action cards */}
      <section className="grid grid-cols-2 gap-4">
        <Link
          href="/design"
          className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[var(--border)] transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="relative">
            <PlusIcon size={42} className="text-[var(--primary)]" />
            <BrushIcon
              size={28}
              className="absolute -bottom-1 -right-2 text-[var(--primary-strong)]"
            />
          </div>
          <p className="mt-1 text-center text-lg font-bold uppercase leading-tight tracking-wide text-[var(--primary)]">
            Start
            <br />
            new
            <br />
            design
          </p>
        </Link>

        <Link
          href="/deliveries"
          className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[var(--border)] transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <TruckIcon size={56} className="text-[var(--primary)]" />
          <p className="mt-1 text-center text-lg font-bold uppercase leading-tight tracking-wide text-[var(--primary)]">
            Track
            <br />
            your
            <br />
            orders
          </p>
        </Link>
      </section>

      {/* Quick stats */}
      {hydrated && (
        <section className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Designs" value={designs.length} />
          <Stat
            label="In transit"
            value={deliveries.filter((d) => d.status !== "delivered").length}
          />
          <Stat
            label="Delivered"
            value={deliveries.filter((d) => d.status === "delivered").length}
          />
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white py-3 ring-1 ring-[var(--border)]">
      <p className="text-2xl font-bold text-[var(--primary)]">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
    </div>
  );
}

function EmptyWardrobe() {
  return (
    <Link
      href="/design"
      className="flex h-36 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] bg-white/60 px-4 text-center text-sm text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
    >
      No designs yet — tap to create your first one.
    </Link>
  );
}
