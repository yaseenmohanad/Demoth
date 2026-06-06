"use client";

import { supabase } from "./supabase";
import type { Design, DesignElement, GarmentType } from "./types";

/**
 * Collab lib (Phase 4) — everything related to "open this design in
 * real-time with a friend". Three responsibilities:
 *
 *   1. Edit invites — send / accept / deny / list. Schema lives in
 *      migration_006_collab.sql.
 *
 *   2. Ensure a design row exists in Supabase before we share it (so
 *      the friend's RLS read can find something). For never-
 *      published designs we insert a quiet row with published=false
 *      and stash the new UUID back into the local design.
 *
 *   3. Helpers for the live cursor + state sync that the design
 *      editor uses on top of Supabase Realtime. The actual channel
 *      lifecycle stays in the editor component — this file just
 *      owns the shape of the messages, the throttle, and the
 *      color palette.
 */

// ---- presence color palette ---------------------------------------------

/** Twelve well-separated hues so collaborators rarely get the same
 *  cursor color. Picked by the editor on join via {@link randomCollabColor}. */
const COLLAB_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#a855f7", // purple
  "#0ea5e9", // sky
];

export function randomCollabColor(): string {
  return COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
}

// ---- invite types --------------------------------------------------------

export interface EditInviteRow {
  id: string;
  status: "pending" | "accepted" | "denied";
  createdAt: number;
  respondedAt: number | null;
  iAmRecipient: boolean;
  designId: string;
  designName: string;
  other: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  };
}

type RawProfile = {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function normalizeProfile(p: RawProfile | null): EditInviteRow["other"] | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name ?? "Designer",
    username: p.username ?? "user",
    avatar: p.avatar,
  };
}

// ---- ensure design is in DB ----------------------------------------------

/**
 * Make sure the given design has a row in Supabase, returning its UUID.
 * Used right before sending an invite so the recipient's RLS read
 * has something to find. Idempotent — if the design has already been
 * published (or had its row created on a previous invite), the
 * existing UUID is returned unchanged.
 *
 * Never sets `published=true` by itself; calling code should hit
 * `publishDesign()` from marketplace.ts when it wants the public
 * Browse behavior. This is just a "create the row so collab can
 * reference it" hook.
 */
export async function ensureDesignInDb(
  design: Design
): Promise<{ designId: string | null; error: string | null }> {
  if (design.publishedId) {
    return { designId: design.publishedId, error: null };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { designId: null, error: "Sign in first to invite a friend." };
  }
  const { data, error } = await supabase
    .from("designs")
    .insert({
      user_id: user.id,
      name: design.name,
      garment: design.garment,
      garment_color: design.garmentColor,
      elements: design.elements,
      published: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { designId: null, error: error?.message ?? "Could not share." };
  }
  return { designId: data.id as string, error: null };
}

// ---- invites: send / accept / deny ---------------------------------------

export async function sendEditInvite(
  recipientId: string,
  designId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (recipientId === user.id) {
    return { error: "You can't invite yourself." };
  }
  const { error } = await supabase.from("edit_invites").insert({
    sender_id: user.id,
    recipient_id: recipientId,
    design_id: designId,
    status: "pending",
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return {
        error:
          "You already invited this friend to this design — wait for them to respond.",
      };
    }
    return { error: error.message };
  }
  return { error: null };
}

export async function acceptEditInvite(
  inviteId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("edit_invites")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", inviteId);
  return { error: error?.message ?? null };
}

export async function denyEditInvite(
  inviteId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("edit_invites")
    .update({ status: "denied", responded_at: new Date().toISOString() })
    .eq("id", inviteId);
  return { error: error?.message ?? null };
}

// ---- list invites for the inbox ------------------------------------------

/** Incoming = invites I received. Newest first; pending bubbled up. */
export async function listIncomingInvites(): Promise<{
  rows: EditInviteRow[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], error: "Sign in first." };
  const { data, error } = await supabase
    .from("edit_invites")
    .select(
      "id, status, created_at, responded_at, design_id, design:designs!design_id(name), sender:profiles!sender_id(id, name, username, avatar)"
    )
    .eq("recipient_id", user.id)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  const rows: EditInviteRow[] = (data ?? [])
    .map((r) => {
      const d = unwrap((r as { design: unknown }).design) as
        | { name: string | null }
        | null;
      const sender = normalizeProfile(
        unwrap((r as { sender: unknown }).sender) as RawProfile | null
      );
      if (!sender) return null;
      return {
        id: r.id as string,
        status: r.status as EditInviteRow["status"],
        createdAt: new Date(r.created_at as string).getTime(),
        respondedAt: r.responded_at
          ? new Date(r.responded_at as string).getTime()
          : null,
        iAmRecipient: true,
        designId: r.design_id as string,
        designName: d?.name ?? "Untitled design",
        other: sender,
      };
    })
    .filter((x): x is EditInviteRow => x !== null);
  return { rows, error: null };
}

// ---- broadcast message shapes --------------------------------------------

/** Sent over the Realtime channel on every pointermove. */
export interface CursorPayload {
  userId: string;
  name: string;
  color: string;
  /** In SVG viewBox units (0-400 x 0-500), so it's resolution-
   *  independent and lines up across devices with different layouts. */
  x: number;
  y: number;
}

/**
 * Sent when a collaborator commits a design change (drag end, text
 * edit, etc.). Throttle the firing of this on the editor side — the
 * sender doesn't want to spam the channel during a live drag.
 *
 * We broadcast the ENTIRE design so the receiver doesn't need to
 * model operational transforms. Last write wins per design.
 */
export interface DesignBroadcastPayload {
  userId: string;
  name: string;
  garment: GarmentType;
  garmentColor: string;
  elements: DesignElement[];
  /** Wall-clock from the sender, useful for tie-breaking concurrent
   *  broadcasts when both clients update at once. */
  sentAt: number;
}
