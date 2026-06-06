export type GarmentType = "tshirt" | "shirt";

export type ShapeVariant =
  // 2D
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "heart"
  | "arrow"
  | "cross"
  | "moon"
  | "droplet"
  | "lightning"
  | "leaf"
  // 3D (rendered with gradients)
  | "cube3d"
  | "sphere3d"
  | "cylinder3d"
  | "cone3d"
  | "pyramid3d";

export type DesignElement =
  | {
      id: string;
      type: "text";
      text: string;
      x: number;
      y: number;
      size: number;
      color: string;
      font: string;
      weight: "normal" | "bold";
      italic: boolean;
      /** Rotation in degrees, 0 = upright. */
      rot: number;
      /** Mirror horizontally (left-right). */
      flipX?: boolean;
      /** Mirror vertically (top-bottom). */
      flipY?: boolean;
    }
  | {
      id: string;
      type: "image";
      src: string;
      x: number;
      y: number;
      w: number;
      h: number;
      /** Rotation in degrees, 0 = upright. */
      rot: number;
      flipX?: boolean;
      flipY?: boolean;
    }
  | {
      id: string;
      type: "stroke";
      d: string;
      color: string;
      width: number;
      /** Visual center of the stroke (initially the d's bbox center). */
      x: number;
      y: number;
      /** Visual size (initially d's bbox size). The path is scaled to fit. */
      w: number;
      h: number;
      /** Rotation in degrees, 0 = upright. */
      rot: number;
      flipX?: boolean;
      flipY?: boolean;
    }
  | {
      id: string;
      type: "shape";
      variant: ShapeVariant;
      x: number;
      y: number;
      w: number;
      h: number;
      /** Rotation in degrees, 0 = upright. */
      rot: number;
      color: string;
      flipX?: boolean;
      flipY?: boolean;
    };

export interface Design {
  id: string;
  name: string;
  garment: GarmentType;
  garmentColor: string;
  elements: DesignElement[];
  createdAt: number;
  updatedAt: number;
  /** Supabase UUID for this design's row in the marketplace `designs`
   *  table, once it's been published at least once. Used to update
   *  the same row on republish (instead of creating duplicates) and
   *  to know which row to flip to `published=false` on unpublish.
   *  Absent for designs that have never been published. */
  publishedId?: string;
  /** Local cache of "is this design currently listed in Browse?".
   *  Mirrors the Supabase `published` column at the last publish/
   *  unpublish moment. Not authoritative — a friend or admin could
   *  flip the DB row out from under us — but good enough to render
   *  the right toggle in the editor. */
  isPublished?: boolean;
}

export interface Profile {
  name: string;
  description: string;
  /** Optional profile picture as a data URL (downscaled before saving). */
  avatar?: string;
  /** Whether the user has activated premium (gives access to the
   *  marketplace, auto-correct, friend lists, cross-edits). */
  premium?: boolean;
  /** When premium is active, auto-correct text typing and smooth
   *  drawings on stroke release. Toggleable in Settings. */
  autoCorrect?: boolean;
  /** Whether other people can find this user in the Friends directory
   *  and send them a friend request. Defaults to true so new accounts
   *  are discoverable; users can opt out from Settings if they want
   *  to be left alone. */
  showOnFriends?: boolean;
  /** Premium-gated: whether the user lets their accepted friends
   *  see the wardrobe (their saved designs) from the friends list.
   *  Defaults to false — sharing is opt-in. */
  shareWardrobe?: boolean;
}

export type DeliveryStatus = "pending" | "shipped" | "delivered" | "cancelled";

export interface Delivery {
  id: string;
  designId: string;
  designName: string;
  status: DeliveryStatus;
  createdAt: number;
  /** Price in USD. Older saves may not have this field — treat as 9 by default. */
  price?: number;
}

export interface MockUser {
  id: string;
  name: string;
  description: string;
  designs: Design[];
  deliveries: Delivery[];
}

export interface AppState {
  profile: Profile;
  designs: Design[];
  deliveries: Delivery[];
  /** Other users seeded for admin demo. */
  mockUsers: MockUser[];
}

/** Fixed unit price for any order, in USD. */
export const ORDER_PRICE = 9;
