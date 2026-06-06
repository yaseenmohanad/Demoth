"use client";

import { supabase } from "./supabase";
import type { Design, DesignElement, GarmentType } from "./types";

/**
 * Friends lib — every Supabase round-trip for the friend graph. Pure
 * SDK calls, no React. The /friends page wraps these in hooks +
 * useState; this file stays UI-agnostic so the same operations can
 * be reused from inbox notifications, profile cards, etc.
 *
 * Mental model: a "friendship" is a row in `friend_requests` with
 * status='accepted'. There's no separate `friendships` table; queries
 * just check either direction of the pair when needed. See
 * migration_005_friends.sql for the schema + RLS.
 */

// ---- types ---------------------------------------------------------------

/** A user the directory / inbox / friends list can render. Aliased
 *  from the profiles row so we don't drag along everything. */
export interface FriendUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  shareWardrobe: boolean;
}

/** One friend_request row joined with whichever side of the pair is
 *  the "other person" from the caller's perspective. */
export interface FriendRequestRow {
  id: string;
  status: "pending" | "accepted" | "denied";
  createdAt: number;
  respondedAt: number | null;
  /** True if the calling user is the recipient (the request was sent
   *  *to* them). False = the calling user sent the request. Drives
   *  whether the inbox shows accept/deny buttons or a status pill. */
  iAmRecipient: boolean;
  /** Profile of the OTHER party (sender if iAmRecipient, recipient
   *  otherwise). Always populated. */
  other: FriendUser;
}

// ---- internal helpers ----------------------------------------------------

type RawProfile = {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  share_wardrobe: boolean | null;
};

function normalizeProfile(p: RawProfile | null | undefined): FriendUser | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name ?? "Designer",
    username: p.username ?? "user",
    avatar: p.avatar,
    shareWardrobe: p.share_wardrobe ?? false,
  };
}

/** PostgREST returns embedded relations as either an object or a
 *  single-element array depending on FK shape. Normalize. */
function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// ---- queries -------------------------------------------------------------

/**
 * Browse the directory of users that have opted in to being findable.
 * Excludes the caller themselves (you can't friend yourself) and
 * anyone you already have a pending/accepted/denied relationship
 * with (no point showing already-actioned people).
 *
 * Returns up to 100 users for now. No search input, no pagination —
 * fine for a school project where the user list is tiny.
 */
export async function listDirectory(): Promise<{
  users: FriendUser[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { users: [], error: "Sign in first." };

  // Pull every existing relationship involving the caller so we can
  // filter the directory client-side. Cheaper than the SQL NOT EXISTS
  // subquery in PostgREST and the friend_requests row count is small.
  const [{ data: existingRaw }, { data: profilesRaw, error }] =
    await Promise.all([
      supabase
        .from("friend_requests")
        .select("sender_id, recipient_id")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`),
      supabase
        .from("profiles")
        .select("id, name, username, avatar, share_wardrobe")
        .eq("show_on_friends", true)
        .neq("id", user.id)
        .limit(100),
    ]);

  if (error) return { users: [], error: error.message };

  const seen = new Set<string>();
  for (const row of existingRaw ?? []) {
    if (row.sender_id !== user.id) seen.add(row.sender_id as string);
    if (row.recipient_id !== user.id) seen.add(row.recipient_id as string);
  }

  const users = (profilesRaw ?? [])
    .filter((p) => !seen.has(p.id))
    .map((p) => normalizeProfile(p as RawProfile))
    .filter((p): p is FriendUser => p !== null);

  return { users, error: null };
}

/** Send a friend request to the given user id. The other side sees
 *  it in their inbox; we see it on the "Sent" tab. */
export async function sendFriendRequest(
  recipientId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (recipientId === user.id) {
    return { error: "You can't send a friend request to yourself." };
  }
  const { error } = await supabase.from("friend_requests").insert({
    sender_id: user.id,
    recipient_id: recipientId,
    status: "pending",
  });
  if (error) {
    // Unique-index violation = a pending request already exists.
    if (/duplicate|unique/i.test(error.message)) {
      return { error: "You already have a pending request with this user." };
    }
    return { error: error.message };
  }
  return { error: null };
}

/** Recipient accepts an incoming request. */
export async function acceptFriendRequest(
  requestId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  return { error: error?.message ?? null };
}

/** Recipient denies an incoming request. The row stays so the
 *  sender gets a "denied" notification. */
export async function denyFriendRequest(
  requestId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "denied", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  return { error: error?.message ?? null };
}

// ---- listings used by the /friends page tabs -----------------------------

/**
 * Inbox: every friend_request row where I'm the *recipient* — pending
 * ones with accept/deny buttons, plus already-actioned ones for
 * history. Newest first.
 */
export async function listInbox(): Promise<{
  rows: FriendRequestRow[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], error: "Sign in first." };
  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "id, status, created_at, responded_at, sender:profiles!sender_id(id, name, username, avatar, share_wardrobe)"
    )
    .eq("recipient_id", user.id)
    .order("status", { ascending: true }) // 'pending' < 'accepted'/'denied' alphabetically
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  const rows: FriendRequestRow[] = (data ?? [])
    .map((r) => {
      const other = normalizeProfile(unwrap((r as { sender: unknown }).sender) as RawProfile | null);
      if (!other) return null;
      return {
        id: r.id as string,
        status: r.status as FriendRequestRow["status"],
        createdAt: new Date(r.created_at as string).getTime(),
        respondedAt: r.responded_at
          ? new Date(r.responded_at as string).getTime()
          : null,
        iAmRecipient: true,
        other,
      };
    })
    .filter((x): x is FriendRequestRow => x !== null);
  return { rows, error: null };
}

/**
 * Sent / notifications: every friend_request row where I'm the
 * *sender*. Shows their accept/deny verdicts (the "this friend denied
 * your friend request" message the user wanted) plus my still-
 * pending outbound requests.
 */
export async function listSent(): Promise<{
  rows: FriendRequestRow[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], error: "Sign in first." };
  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "id, status, created_at, responded_at, recipient:profiles!recipient_id(id, name, username, avatar, share_wardrobe)"
    )
    .eq("sender_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  const rows: FriendRequestRow[] = (data ?? [])
    .map((r) => {
      const other = normalizeProfile(unwrap((r as { recipient: unknown }).recipient) as RawProfile | null);
      if (!other) return null;
      return {
        id: r.id as string,
        status: r.status as FriendRequestRow["status"],
        createdAt: new Date(r.created_at as string).getTime(),
        respondedAt: r.responded_at
          ? new Date(r.responded_at as string).getTime()
          : null,
        iAmRecipient: false,
        other,
      };
    })
    .filter((x): x is FriendRequestRow => x !== null);
  return { rows, error: null };
}

/**
 * My friends: accepted requests in either direction with the other
 * party's profile. Used by both the Friends tab on /friends and the
 * "who can I share my edits with" listing later in Phase 4.
 */
export async function listFriends(): Promise<{
  friends: FriendUser[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { friends: [], error: "Sign in first." };
  // Two-half query: where I'm the sender or the recipient. We just
  // OR them in a single Supabase call — PostgREST translates that
  // straight to SQL.
  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "sender_id, recipient_id, sender:profiles!sender_id(id, name, username, avatar, share_wardrobe), recipient:profiles!recipient_id(id, name, username, avatar, share_wardrobe)"
    )
    .eq("status", "accepted")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);
  if (error) return { friends: [], error: error.message };
  const friends: FriendUser[] = [];
  for (const row of data ?? []) {
    const r = row as {
      sender_id: string;
      recipient_id: string;
      sender: unknown;
      recipient: unknown;
    };
    const otherRaw =
      r.sender_id === user.id
        ? unwrap(r.recipient)
        : unwrap(r.sender);
    const other = normalizeProfile(otherRaw as RawProfile | null);
    if (other) friends.push(other);
  }
  return { friends, error: null };
}

// ---- friend wardrobe view ------------------------------------------------

/**
 * Fetch every design owned by `friendId` that the calling user is
 * allowed to see. RLS (the share_wardrobe policy in migration 005)
 * does the access-control heavy lifting — this just runs the query
 * and trusts the result.
 *
 * Returns shaped Design objects so they're swap-compatible with the
 * local store's design list and can be rendered by DesignPreview.
 */
export async function listFriendDesigns(friendId: string): Promise<{
  designs: Design[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("designs")
    .select("id, name, garment, garment_color, elements, created_at, updated_at, published")
    .eq("user_id", friendId)
    .order("updated_at", { ascending: false });
  if (error) return { designs: [], error: error.message };
  const designs: Design[] = (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? "Untitled design",
    garment: row.garment as GarmentType,
    garmentColor: (row.garment_color as string) ?? "#ffffff",
    elements: (row.elements as DesignElement[]) ?? [],
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    publishedId: row.id as string,
    isPublished: (row.published as boolean) ?? false,
  }));
  return { designs, error: null };
}

/** Fetch one user's profile for the wardrobe header. */
export async function getProfileById(id: string): Promise<{
  user: FriendUser | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, username, avatar, share_wardrobe")
    .eq("id", id)
    .single();
  if (error) return { user: null, error: error.message };
  return { user: normalizeProfile(data as RawProfile), error: null };
}
