"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getProfileById,
  listFriendDesigns,
  type FriendUser,
} from "@/lib/friends";
import type { Design } from "@/lib/types";
import Avatar from "@/components/Avatar";
import DesignPreview from "@/components/DesignPreview";
import { ArrowLeftIcon, SpinnerIcon } from "@/components/Icons";

/**
 * Friend wardrobe view — one friend, their visible designs. The
 * "visible" filter is enforced server-side by the designs_select
 * RLS policy (migration 005): a viewer gets back published designs
 * always, and additionally the friend's unpublished designs only
 * when the friend has share_wardrobe=true AND there's an accepted
 * friend_request row tying the two users.
 *
 * If share_wardrobe is off, the page falls back to "this friend's
 * wardrobe is private" plus whatever they've published in the
 * marketplace.
 */
export default function FriendWardrobePage() {
  const params = useParams<{ id: string }>();
  const friendId = params.id;

  const [profile, setProfile] = useState<FriendUser | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProfileById(friendId), listFriendDesigns(friendId)]).then(
      ([p, d]) => {
        if (cancelled) return;
        if (p.error) setError(p.error);
        else if (d.error) setError(d.error);
        setProfile(p.user);
        setDesigns(d.designs);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [friendId]);

  if (loading) {
    return (
      <div className="grid place-items-center rounded-2xl bg-white px-4 py-12 text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
        <SpinnerIcon size={24} />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="space-y-3">
        <Link
          href="/friends"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]"
        >
          <ArrowLeftIcon size={16} /> Back to Friends
        </Link>
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm text-red-700 ring-1 ring-red-200">
          {error ?? "Couldn't find that user."}
        </p>
      </div>
    );
  }

  // Split visible designs into published (always visible to friends)
  // and private-shared (only visible because share_wardrobe is on).
  const publishedOnly = designs.filter((d) => d.isPublished);
  const privateShared = designs.filter((d) => !d.isPublished);

  return (
    <div className="space-y-5">
      <Link
        href="/friends"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeftIcon size={16} /> Back to Friends
      </Link>

      <header className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-[var(--border)]">
        <Avatar name={profile.name} src={profile.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{profile.name}</h1>
          <p className="truncate text-xs text-[var(--muted)]">
            @{profile.username}
          </p>
        </div>
      </header>

      {/* Private wardrobe — only present when share_wardrobe=true AND
          the RLS rule let us through. */}
      {privateShared.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            Wardrobe ({privateShared.length})
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {privateShared.map((d) => (
              <li
                key={d.id}
                className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-[var(--border)]"
              >
                <div className="overflow-hidden rounded-xl bg-[var(--background)]">
                  <DesignPreview design={d} className="h-40 w-full" />
                </div>
                <p className="mt-1 truncate px-1 text-sm font-semibold">
                  {d.name || "Untitled"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {publishedOnly.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            Published in Browse ({publishedOnly.length})
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {publishedOnly.map((d) => (
              <li
                key={d.id}
                className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-[var(--border)]"
              >
                <div className="overflow-hidden rounded-xl bg-[var(--background)]">
                  <DesignPreview design={d} className="h-40 w-full" />
                </div>
                <p className="mt-1 truncate px-1 text-sm font-semibold">
                  {d.name || "Untitled"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {designs.length === 0 && (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
          {profile.shareWardrobe
            ? "This friend hasn't made any designs yet."
            : "This friend keeps their wardrobe private and hasn't published anything to Browse."}
        </p>
      )}
    </div>
  );
}
