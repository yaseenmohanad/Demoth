/**
 * Hand-written TypeScript types matching the public schema in
 * supabase/schema.sql. Kept in sync manually — if you change the SQL,
 * change this file too. (We can switch to `supabase gen types` later.)
 */

import type { DesignElement, GarmentType } from "./types";

export interface DbProfile {
  id: string;
  /** Unique handle used for sign-in. 3-20 chars, lowercase letters,
   *  digits, underscore. Internally we derive an artificial email
   *  (`<username>@demoth.local`) so Supabase Auth still gets a unique
   *  email, but users never type or see it. */
  username: string;
  name: string;
  description: string;
  avatar: string | null;
  premium: boolean;
  auto_correct: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbDesign {
  id: string;
  user_id: string;
  name: string;
  garment: GarmentType;
  garment_color: string;
  elements: DesignElement[];
  created_at: string;
  updated_at: string;
}

export type DbDeliveryStatus = "pending" | "shipped" | "delivered" | "cancelled";

export interface DbDelivery {
  id: string;
  user_id: string;
  design_id: string | null;
  design_name: string;
  status: DbDeliveryStatus;
  price: number;
  created_at: string;
}
