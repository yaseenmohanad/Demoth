"use client";

import { supabase } from "./supabase";
import type { Design, DesignElement, GarmentType } from "./types";
import { ORDER_PRICE } from "./types";

/**
 * Marketplace lib — every Supabase round-trip related to publishing
 * a design, browsing the marketplace, and buying. Kept separate from
 * store.ts (which is a localStorage-backed, signed-out-friendly cache
 * of personal designs) because these operations all require an active
 * Supabase session and live state from the database.
 */

// ---- types ---------------------------------------------------------------

/**
 * One row in the Browse marketplace. A normalised view of the
 * `designs` table joined with the seller's profile, with timestamps
 * converted to ms so the rest of the app (which uses Date.now()
 * everywhere) can treat it the same as a local Design.
 */
export interface MarketplaceListing {
  /** Supabase UUID — used by the buy flow and to update the same
   *  row on republish. */
  id: string;
  name: string;
  garment: GarmentType;
  garmentColor: string;
  elements: DesignElement[];
  createdAt: number;
  updatedAt: number;
  /** Seller / designer info, joined from the `profiles` table. */
  author: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  };
}

/**
 * Adapter — render a marketplace listing through the existing
 * <DesignPreview /> component, which expects a local Design shape.
 * The Supabase UUID becomes the local id; consumers should NOT pass
 * the result through saveDesign() (it'd overwrite a local design
 * with the same id, which won't happen because UUIDs don't collide
 * with our 8-char base36 local ids, but still — don't).
 */
export function listingToDesign(l: MarketplaceListing): Design {
  return {
    id: l.id,
    name: l.name,
    garment: l.garment,
    garmentColor: l.garmentColor,
    elements: l.elements,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    publishedId: l.id,
    isPublished: true,
  };
}

// ---- publish / unpublish -------------------------------------------------

export interface PublishResult {
  /** Supabase UUID of the published row. The caller should write
   *  this back into the local design's `publishedId` field so
   *  subsequent publish clicks update the same row. */
  publishedId: string | null;
  error: string | null;
}

/**
 * Publish a design to the marketplace. If the design already has a
 * publishedId, the matching row is updated in place; otherwise a new
 * row is inserted and its UUID is returned for the caller to store
 * locally. Either way the resulting row has `published=true`.
 *
 * Requires an active Supabase session — the row is owned by the
 * signed-in user via designs.user_id, enforced both client-side (here)
 * and server-side (via the designs_insert_own / designs_update_own
 * RLS policies from schema.sql).
 */
export async function publishDesign(design: Design): Promise<PublishResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      publishedId: null,
      error: "Sign in first to publish designs to Browse.",
    };
  }

  // Fields to write either way — name + garment + color + elements
  // all reflect the current local state at publish time.
  const row = {
    user_id: user.id,
    name: design.name,
    garment: design.garment,
    garment_color: design.garmentColor,
    elements: design.elements,
    published: true,
  };

  if (design.publishedId) {
    const { error } = await supabase
      .from("designs")
      .update(row)
      .eq("id", design.publishedId)
      .eq("user_id", user.id);
    if (error) return { publishedId: null, error: error.message };
    return { publishedId: design.publishedId, error: null };
  }

  const { data, error } = await supabase
    .from("designs")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    return { publishedId: null, error: error?.message ?? "Could not publish." };
  }
  return { publishedId: data.id as string, error: null };
}

/**
 * Set a previously-published design back to `published=false`. We
 * keep the row around (don't delete) so a quick re-publish later
 * uses the same UUID and the orders that referenced this design
 * still have something to point at via deliveries.design_id.
 */
export async function unpublishDesign(
  publishedId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("designs")
    .update({ published: false })
    .eq("id", publishedId)
    .eq("user_id", user.id);
  return { error: error?.message ?? null };
}

// ---- browse listing -------------------------------------------------------

/**
 * Fetch every published design with its author. The Browse page
 * renders these as cards; the buy flow takes the chosen listing's
 * id straight into the deliveries table.
 *
 * Newest-first by `updated_at`. We don't paginate yet — there's no
 * realistic way to have thousands of published designs for a school
 * project — but the partial index from migration 004 keeps this
 * cheap if we ever do.
 */
export async function listPublishedDesigns(): Promise<{
  listings: MarketplaceListing[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("designs")
    .select(
      // FK embed: designs.user_id → profiles.id, aliased as `author`.
      "id, name, garment, garment_color, elements, created_at, updated_at, author:profiles!user_id(id, name, username, avatar)"
    )
    .eq("published", true)
    .order("updated_at", { ascending: false });
  if (error) return { listings: [], error: error.message };

  const listings: MarketplaceListing[] = (data ?? [])
    // The PostgREST embed can return `author` as either a single
    // object or an array depending on the FK shape — normalise.
    .map((row) => {
      const authorRaw = (row as { author: unknown }).author;
      const author = Array.isArray(authorRaw) ? authorRaw[0] : authorRaw;
      const a = author as {
        id: string;
        name: string;
        username: string;
        avatar: string | null;
      } | null;
      if (!a) return null;
      return {
        id: row.id as string,
        name: (row.name as string) ?? "Untitled design",
        garment: row.garment as GarmentType,
        garmentColor: (row.garment_color as string) ?? "#ffffff",
        elements: (row.elements as DesignElement[]) ?? [],
        createdAt: new Date(row.created_at as string).getTime(),
        updatedAt: new Date(row.updated_at as string).getTime(),
        author: {
          id: a.id,
          name: a.name ?? "Designer",
          username: a.username ?? "user",
          avatar: a.avatar,
        },
      };
    })
    .filter((x): x is MarketplaceListing => x !== null);

  return { listings, error: null };
}

// ---- buy flow -------------------------------------------------------------

/**
 * Record a purchase of a marketplace listing. Writes a row to the
 * `deliveries` table owned by the current (signed-in) user, with
 * the design's UUID as `design_id` and a snapshot of the design
 * name (plus the seller's name) so the order history reads sensibly
 * even after the design is later renamed / unpublished.
 *
 * Returns the buyer-side delivery record so callers can also push
 * it into the local store (the Deliveries page still reads from
 * localStorage) without an extra round-trip.
 */
export async function buyListing(listing: MarketplaceListing): Promise<{
  error: string | null;
  localDelivery?: {
    id: string;
    designId: string;
    designName: string;
    status: "pending";
    createdAt: number;
    price: number;
  };
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in first to buy designs." };
  }

  const orderName = `${listing.name} (from ${listing.author.name})`;
  const { data, error } = await supabase
    .from("deliveries")
    .insert({
      user_id: user.id,
      design_id: listing.id,
      design_name: orderName,
      status: "pending",
      price: ORDER_PRICE,
    })
    .select("id, created_at")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not place order." };
  }

  return {
    error: null,
    localDelivery: {
      id: data.id as string,
      designId: listing.id,
      designName: orderName,
      status: "pending" as const,
      createdAt: new Date(data.created_at as string).getTime(),
      price: ORDER_PRICE,
    },
  };
}
