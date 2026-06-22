"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  listDirectory,
  listInbox,
  listSent,
  listFriends,
  sendFriendRequest,
  acceptFriendRequest,
  denyFriendRequest,
  type FriendUser,
  type FriendRequestRow,
} from "@/lib/friends";
import {
  listIncomingInvites,
  acceptEditInvite,
  denyEditInvite,
  type EditInviteRow,
} from "@/lib/collab";
import Avatar from "@/components/Avatar";
import {
  UsersIcon,
  InboxIcon,
  SearchIcon,
  PlusIcon,
  CheckIcon,
  XIcon,
  SpinnerIcon,
  BrushIcon,
} from "@/components/Icons";

/**
 * /friends — Phase 3's main page. Three tabs:
 *
 *   • Friends — accepted relationships, click through to a friend's
 *     wardrobe view.
 *   • Discover — directory of opt-in profiles you don't already have
 *     a relationship with; one tap to send a request.
 *   • Inbox — pending requests directed at you (accept/deny), plus
 *     verdicts on requests you sent (accepted / denied notifications).
 *
 * All three load lazily on first tab activation so we don't slam
 * Supabase with three queries on page mount. Each tab knows how to
 * refresh itself after a mutation (send / accept / deny).
 */

type Tab = "friends" | "discover" | "inbox";

export default function FriendsPage() {
  const { user: authUser } = useAuth();
  const [tab, setTab] = useState<Tab>("friends");

  // ----- signed-out gate -----
  if (authUser === null) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Friends
          </p>
          <h1 className="mt-1 text-3xl font-bold">Find your people</h1>
        </header>
        <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[var(--border)]">
          <UsersIcon size={40} />
          <h2 className="mt-3 text-lg font-bold">Sign in to use Friends</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">
            Friend requests, accepted friends and the inbox all need an
            account. Free to create — no email confirmation.
          </p>
          <Link
            href="/sign-in?next=/friends"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]"
          >
            Sign in
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <UsersIcon size={22} />
        <h1 className="text-2xl font-bold">Friends</h1>
      </header>

      <div className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-[var(--border)]">
        <TabBtn active={tab === "friends"} onClick={() => setTab("friends")}>
          <UsersIcon size={14} /> Friends
        </TabBtn>
        <TabBtn active={tab === "discover"} onClick={() => setTab("discover")}>
          <SearchIcon size={14} /> Discover
        </TabBtn>
        <TabBtn active={tab === "inbox"} onClick={() => setTab("inbox")}>
          <InboxIcon size={14} /> Inbox
        </TabBtn>
      </div>

      {tab === "friends" && <FriendsTab />}
      {tab === "discover" && <DiscoverTab />}
      {tab === "inbox" && <InboxTab />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-[var(--primary)] text-white"
          : "text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

// ---- FRIENDS TAB -----------------------------------------------------------

function FriendsTab() {
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFriends().then(({ friends: rows, error: e }) => {
      if (cancelled) return;
      setError(e);
      setFriends(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (friends.length === 0) {
    return (
      <Empty
        title="No friends yet"
        body="Find people in Discover and send them a request. When they accept, they'll show up here."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {friends.map((f) => (
        <li key={f.id}>
          <Link
            href={`/friends/${f.id}`}
            className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)] hover:ring-[var(--primary)]"
          >
            <Avatar name={f.name} src={f.avatar} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{f.name}</p>
              <p className="truncate text-xs text-[var(--muted)]">
                {f.shareWardrobe
                  ? "Shares their wardrobe with you"
                  : "Friends"}
              </p>
            </div>
            <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
              {f.shareWardrobe ? "Wardrobe" : "Profile"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---- DISCOVER TAB ----------------------------------------------------------

function DiscoverTab() {
  const [users, setUsers] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setLoading(true);
    listDirectory().then(({ users: rows, error: e }) => {
      setError(e);
      setUsers(rows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSend(userId: string) {
    if (sending) return;
    setSending(userId);
    const { error: e } = await sendFriendRequest(userId);
    setSending(null);
    if (e) {
      setError(e);
      return;
    }
    // Optimistically mark sent. The directory will re-filter on next
    // refresh to fully drop this user, but this gives instant feedback.
    setSent((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (users.length === 0) {
    return (
      <Empty
        title="Nobody to discover"
        body="When other users sign up and leave the 'Show me on Friends' toggle on, they'll appear here."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {users.map((u) => {
        const isSent = sent.has(u.id);
        const isSending = sending === u.id;
        return (
          <li
            key={u.id}
            className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]"
          >
            <Avatar name={u.name} src={u.avatar} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{u.name}</p>
            </div>
            <button
              type="button"
              onClick={() => handleSend(u.id)}
              disabled={isSent || isSending}
              className="flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? (
                <SpinnerIcon size={12} />
              ) : isSent ? (
                <>
                  <CheckIcon size={12} /> Sent
                </>
              ) : (
                <>
                  <PlusIcon size={12} /> Add
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---- INBOX TAB -------------------------------------------------------------

/**
 * Inbox = pending requests directed at me (accept/deny) + every
 * request I sent (so I see the sender-side verdicts). We pull both
 * lists in parallel and merge them, sorted with pending-actionable
 * items first, then by newest activity.
 */
function InboxTab() {
  const router = useRouter();
  const [incoming, setIncoming] = useState<FriendRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestRow[]>([]);
  const [editInvites, setEditInvites] = useState<EditInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [a, b, c] = await Promise.all([
      listInbox(),
      listSent(),
      listIncomingInvites(),
    ]);
    if (a.error || b.error || c.error) {
      setError(a.error ?? b.error ?? c.error);
    } else {
      setError(null);
    }
    setIncoming(a.rows);
    setOutgoing(b.rows);
    setEditInvites(c.rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAccept(id: string) {
    if (busyId) return;
    setBusyId(id);
    const { error: e } = await acceptFriendRequest(id);
    setBusyId(null);
    if (e) {
      setError(e);
      return;
    }
    void refresh();
  }
  async function handleDeny(id: string) {
    if (busyId) return;
    setBusyId(id);
    const { error: e } = await denyFriendRequest(id);
    setBusyId(null);
    if (e) {
      setError(e);
      return;
    }
    void refresh();
  }

  // Edit-invite handlers. Accepting also routes the user straight
  // into the design editor for that design — that's the "you will
  // be transferred to the design" part of the original spec.
  async function handleEditAccept(invite: EditInviteRow) {
    if (busyId) return;
    setBusyId(invite.id);
    const { error: e } = await acceptEditInvite(invite.id);
    setBusyId(null);
    if (e) {
      setError(e);
      return;
    }
    router.push(`/design?id=${invite.designId}`);
  }
  async function handleEditDeny(invite: EditInviteRow) {
    if (busyId) return;
    setBusyId(invite.id);
    const { error: e } = await denyEditInvite(invite.id);
    setBusyId(null);
    if (e) {
      setError(e);
      return;
    }
    void refresh();
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;

  const pendingIncoming = incoming.filter((r) => r.status === "pending");
  const handledIncoming = incoming.filter((r) => r.status !== "pending");
  const pendingEdits = editInvites.filter((r) => r.status === "pending");
  const handledEdits = editInvites.filter((r) => r.status !== "pending");

  if (
    pendingIncoming.length === 0 &&
    handledIncoming.length === 0 &&
    outgoing.length === 0 &&
    editInvites.length === 0
  ) {
    return (
      <Empty
        title="Inbox is empty"
        body="Friend requests, edit invites, and verdict notifications all show up here."
      />
    );
  }

  return (
    <div className="space-y-5">
      {pendingEdits.length > 0 && (
        <Group title="Edit invites">
          {pendingEdits.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-200"
            >
              <Avatar name={inv.other.name} src={inv.other.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{inv.other.name}</p>
                <p className="truncate text-xs text-[var(--muted)]">
                  wants to co-edit&nbsp;
                  <strong className="text-[var(--foreground)]">
                    {inv.designName}
                  </strong>
                </p>
              </div>{/* edit-invite — no @username shown to protect privacy */}
              <button
                type="button"
                onClick={() => handleEditAccept(inv)}
                disabled={busyId === inv.id}
                aria-label="Open design together"
                title="Open design together"
                className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)] disabled:opacity-50"
              >
                <BrushIcon size={16} />
              </button>
              <button
                type="button"
                onClick={() => handleEditDeny(inv)}
                disabled={busyId === inv.id}
                aria-label="Deny"
                title="Deny"
                className="grid h-9 w-9 place-items-center rounded-lg bg-white text-red-600 ring-1 ring-[var(--border)] hover:bg-red-50 disabled:opacity-50"
              >
                <XIcon size={16} />
              </button>
            </li>
          ))}
        </Group>
      )}

      {pendingIncoming.length > 0 && (
        <Group title="Incoming requests">
          {pendingIncoming.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200"
            >
              <Avatar name={r.other.name} src={r.other.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{r.other.name}</p>
                <p className="truncate text-xs text-[var(--muted)]">
                  wants to be friends
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAccept(r.id)}
                disabled={busyId === r.id}
                aria-label="Accept"
                title="Accept"
                className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                <CheckIcon size={16} />
              </button>
              <button
                type="button"
                onClick={() => handleDeny(r.id)}
                disabled={busyId === r.id}
                aria-label="Deny"
                title="Deny"
                className="grid h-9 w-9 place-items-center rounded-lg bg-white text-red-600 ring-1 ring-[var(--border)] hover:bg-red-50 disabled:opacity-50"
              >
                <XIcon size={16} />
              </button>
            </li>
          ))}
        </Group>
      )}

      {outgoing.length > 0 && (
        <Group title="Sent">
          {outgoing.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]"
            >
              <Avatar name={r.other.name} src={r.other.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{r.other.name}</p>
              </div>
              <StatusPill status={r.status} who="sent" />
            </li>
          ))}
        </Group>
      )}

      {handledIncoming.length > 0 && (
        <Group title="Earlier requests">
          {handledIncoming.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]"
            >
              <Avatar name={r.other.name} src={r.other.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{r.other.name}</p>
              </div>
              <StatusPill status={r.status} who="received" />
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function StatusPill({
  status,
  who,
}: {
  status: FriendRequestRow["status"];
  who: "sent" | "received";
}) {
  const cls =
    status === "accepted"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "denied"
      ? "bg-red-50 text-red-700 ring-red-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";
  // The "this friend denied your friend request" wording the user
  // asked for lives here when status='denied' on a sent row.
  const label =
    who === "sent"
      ? status === "pending"
        ? "Pending"
        : status === "accepted"
        ? "Accepted you"
        : "Denied your request"
      : status === "accepted"
      ? "You accepted"
      : "You denied";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${cls}`}
    >
      {label}
    </span>
  );
}

// ---- shared bits -----------------------------------------------------------

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center rounded-2xl bg-white px-4 py-12 text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
      <SpinnerIcon size={24} />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm text-red-700 ring-1 ring-red-200">
      {message}
    </p>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-[var(--border)]">
      <p className="text-sm font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--muted)]">{body}</p>
    </div>
  );
}
