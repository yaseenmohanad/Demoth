"use client";

import { supabase } from "./supabase";
import type {
  Delivery,
  DeliveryStatus,
  Design,
  DesignElement,
  GarmentType,
} from "./types";

/**
 * Admin lib — Supabase queries used by the /admin page. All operations
 * here rely on the existing `is_admin` RLS gates (see schema.sql) for
 * authorization; this file is just the data layer, not the policy
 * enforcement. The page-level guard refuses to render at all unless
 * the caller's profile has is_admin=true, but RLS is the source of
 * truth — a non-admin who somehow loaded the page would still get
 * permission errors from Supabase.
 */

// ---- shapes the admin page renders --------------------------------------

export interface AdminProfile {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  description: string;
  premium: boolean;
  isAdmin: boolean;
  createdAt: number;
  designCount: number;
  deliveryCount: number;
}

export interface AdminDelivery {
  id: string;
  status: DeliveryStatus;
  price: number;
  createdAt: number;
  designName: string;
  /** Snapshot of the design at the time of purchase. Null if the
   *  delivery references a design that was deleted server-side. */
  design: Design | null;
  buyer: { id: string; name: string; username: string; avatar: string | null };
  designer: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  } | null;
}

// ---- raw row helpers ----------------------------------------------------

type RawProfile = {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  description: string | null;
  premium: boolean | null;
  is_admin: boolean | null;
  created_at: string | null;
  designs: { id: string }[] | null;
  deliveries: { id: string }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// ---- profiles -----------------------------------------------------------

/**
 * Every real user, with design + order counts. We pull counts via
 * cheap embedded id-only relations; for a school project that's fine,
 * since user count stays tiny.
 */
export async function listAllProfiles(): Promise<{
  profiles: AdminProfile[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, name, username, avatar, description, premium, is_admin, created_at, designs(id), deliveries(id)"
    )
    .order("created_at", { ascending: false });
  if (error) return { profiles: [], error: error.message };
  const profiles: AdminProfile[] = (data ?? []).map((row) => {
    const r = row as RawProfile;
    return {
      id: r.id,
      name: r.name ?? "Designer",
      username: r.username ?? "user",
      avatar: r.avatar,
      description: r.description ?? "",
      premium: r.premium ?? false,
      isAdmin: r.is_admin ?? false,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
      designCount: r.designs?.length ?? 0,
      deliveryCount: r.deliveries?.length ?? 0,
    };
  });
  return { profiles, error: null };
}

// ---- deliveries ---------------------------------------------------------

/**
 * Every order in the system, joined with the buyer's profile and the
 * design (plus its designer's profile). Newest first. Used by the
 * admin's "All orders" feed and (when filtered) per-user breakdowns.
 */
export async function listAllDeliveries(): Promise<{
  deliveries: AdminDelivery[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("deliveries")
    .select(
      `id, status, price, created_at, design_name,
       buyer:profiles!user_id(id, name, username, avatar),
       design:designs!design_id(
         id, name, garment, garment_color, elements, created_at, updated_at,
         designer:profiles!user_id(id, name, username, avatar)
       )`
    )
    .order("created_at", { ascending: false });
  if (error) return { deliveries: [], error: error.message };

  const deliveries: AdminDelivery[] = (data ?? []).map((row) => {
    type Raw = {
      id: string;
      status: DeliveryStatus;
      price: number | string;
      created_at: string;
      design_name: string;
      buyer: unknown;
      design: unknown;
    };
    const r = row as Raw;
    const buyer = unwrap(r.buyer) as RawProfile | null;
    const designRaw = unwrap(r.design) as
      | (RawProfile & {
          garment: GarmentType;
          garment_color: string | null;
          elements: DesignElement[] | null;
          updated_at: string | null;
          designer: unknown;
        })
      | null;
    const designer = designRaw
      ? (unwrap(designRaw.designer) as RawProfile | null)
      : null;
    const design: Design | null = designRaw
      ? {
          id: designRaw.id,
          name: designRaw.name ?? "Untitled design",
          garment: designRaw.garment,
          garmentColor: designRaw.garment_color ?? "#ffffff",
          elements: designRaw.elements ?? [],
          createdAt: designRaw.created_at
            ? new Date(designRaw.created_at).getTime()
            : 0,
          updatedAt: designRaw.updated_at
            ? new Date(designRaw.updated_at).getTime()
            : 0,
          publishedId: designRaw.id,
        }
      : null;
    return {
      id: r.id,
      status: r.status,
      price: typeof r.price === "string" ? Number(r.price) : r.price,
      createdAt: new Date(r.created_at).getTime(),
      designName: r.design_name,
      design,
      buyer: buyer
        ? {
            id: buyer.id,
            name: buyer.name ?? "Designer",
            username: buyer.username ?? "user",
            avatar: buyer.avatar,
          }
        : {
            id: "unknown",
            name: "Unknown",
            username: "unknown",
            avatar: null,
          },
      designer: designer
        ? {
            id: designer.id,
            name: designer.name ?? "Designer",
            username: designer.username ?? "user",
            avatar: designer.avatar,
          }
        : null,
    };
  });
  return { deliveries, error: null };
}

/** Admin-only status change. RLS lets through because of the
 *  is_admin branch in deliveries_update_admin. */
export async function setDeliveryStatus(
  id: string,
  status: DeliveryStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("deliveries")
    .update({ status })
    .eq("id", id);
  return { error: error?.message ?? null };
}

/** Admin-only delete. Same RLS path. */
export async function deleteDelivery(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("deliveries").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// ---- aggregate counts for the dashboard tiles ---------------------------

export async function countAllDesigns(): Promise<{
  count: number;
  error: string | null;
}> {
  const { count, error } = await supabase
    .from("designs")
    .select("id", { count: "exact", head: true });
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}
