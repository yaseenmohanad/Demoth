"use client";

import { supabase } from "./supabase";
import type { Design, DesignElement, GarmentType, Profile } from "./types";

/**
 * Cross-device sync helpers. Bridges the localStorage-backed store
 * (fast, offline-friendly, but per-device) with the Supabase profiles
 * / designs rows (single source of truth across devices).
 *
 * Strategy:
 *   - Sign-in: pull profile + designs from Supabase, mirror them into
 *     the local store so the display name / wardrobe are the same on
 *     every device the user signs in on.
 *   - Save-time: also push the change to Supabase so the next sign-in
 *     elsewhere sees it.
 *
 * Everything below is fire-and-forget from the caller's perspective —
 * network failures shouldn't break the local UI. Errors are logged and
 * swallowed unless the caller explicitly awaits.
 */

// ---- pull: DB → local ----------------------------------------------------

/**
 * Fetch every design owned by the current signed-in user, converted
 * to the local Design shape ready for hydrateFromDb(). Designs the
 * user published to the marketplace, private drafts, and any design
 * a friend gave the user edit-access to are all in scope of the
 * designs_select RLS policy; we filter to `user_id = me` so a friend's
 * private designs don't accidentally pollute the local wardrobe.
 */
export async function fetchMyDesigns(): Promise<{
  designs: Design[];
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { designs: [], error: null };
  const { data, error } = await supabase
    .from("designs")
    .select(
      "id, name, garment, garment_color, elements, created_at, updated_at, published"
    )
    .eq("user_id", user.id)
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
    isPublished: !!(row.published as boolean),
  }));
  return { designs, error: null };
}

// ---- push: local → DB ----------------------------------------------------

/**
 * Upsert one local design to Supabase.
 *   - Design already has publishedId → UPDATE that row (preserves the
 *     `published` flag so unpublished drafts stay unpublished, and
 *     marketplace listings keep their status).
 *   - Design has no publishedId → INSERT a new row (published=false),
 *     returning the new UUID so the caller can write it back into the
 *     local design.
 *
 * Silently no-ops when the user is signed-out — guests can only save
 * to localStorage.
 */
export async function pushDesignToDb(design: Design): Promise<{
  publishedId: string | null;
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { publishedId: design.publishedId ?? null, error: null };

  const row = {
    user_id: user.id,
    name: design.name,
    garment: design.garment,
    garment_color: design.garmentColor,
    elements: design.elements,
  };

  if (design.publishedId) {
    const { error } = await supabase
      .from("designs")
      .update(row)
      .eq("id", design.publishedId)
      .eq("user_id", user.id);
    return { publishedId: design.publishedId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from("designs")
    .insert({ ...row, published: false })
    .select("id")
    .single();
  if (error || !data) {
    return { publishedId: null, error: error?.message ?? "Insert failed" };
  }
  return { publishedId: data.id as string, error: null };
}

/**
 * Remove one design from Supabase. Silently no-ops when signed out or
 * when the design was never pushed (no publishedId). Failures are
 * swallowed — the local delete has already succeeded either way.
 */
export async function deleteDesignFromDb(publishedId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("designs")
    .delete()
    .eq("id", publishedId)
    .eq("user_id", user.id);
}

/**
 * Mirror a Profile patch to the Supabase profiles row. Local Profile
 * uses camelCase; the DB uses snake_case, so we map field-by-field.
 * Fields the patch doesn't include are left untouched in the DB.
 */
export async function pushProfileToDb(patch: Partial<Profile>): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.avatar !== undefined) dbPatch.avatar = patch.avatar;
  if (patch.premium !== undefined) dbPatch.premium = patch.premium;
  if (patch.autoCorrect !== undefined) dbPatch.auto_correct = patch.autoCorrect;
  if (patch.showOnFriends !== undefined)
    dbPatch.show_on_friends = patch.showOnFriends;
  if (patch.shareWardrobe !== undefined)
    dbPatch.share_wardrobe = patch.shareWardrobe;

  if (Object.keys(dbPatch).length === 0) return;
  await supabase.from("profiles").update(dbPatch).eq("id", user.id);
}
