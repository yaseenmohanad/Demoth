"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import type {
  AppState,
  Design,
  Profile,
  Delivery,
  DeliveryStatus,
  MockUser,
} from "./types";
import { ORDER_PRICE } from "./types";
import { strokeBBox } from "./element-transform";

const STORAGE_KEY = "demoth.state.v1";

// ---- mock seed (other users for admin demo) ----------------------------
const SANS = "var(--font-geist-sans), system-ui, sans-serif";
const DISPLAY = "Impact, 'Arial Black', sans-serif";

const mockUsersSeed: MockUser[] = [
  {
    id: "u-mia",
    name: "Mia",
    description: "Bold typography fan.",
    designs: [
      {
        id: "d-mia-1",
        name: "Tour '25",
        garment: "tshirt",
        garmentColor: "#0f172a",
        elements: [
          {
            id: "e1",
            type: "text",
            text: "TOUR '25",
            x: 200,
            y: 250,
            size: 36,
            color: "#ffffff",
            font: DISPLAY,
            weight: "bold",
            italic: false,
            rot: 0,
          },
        ],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
        updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      },
    ],
    deliveries: [
      {
        id: "o-mia-1",
        designId: "d-mia-1",
        designName: "Tour '25",
        status: "pending",
        createdAt: Date.now() - 1000 * 60 * 60 * 6,
        price: ORDER_PRICE,
      },
      {
        id: "o-mia-2",
        designId: "d-mia-1",
        designName: "Tour '25",
        status: "shipped",
        createdAt: Date.now() - 1000 * 60 * 60 * 26,
        price: ORDER_PRICE,
      },
    ],
  },
  {
    id: "u-ravi",
    name: "Ravi",
    description: "Minimalist, mostly monochrome.",
    designs: [
      {
        id: "d-ravi-1",
        name: "Mono Shirt",
        garment: "shirt",
        garmentColor: "#ffffff",
        elements: [
          {
            id: "e1",
            type: "text",
            text: "less",
            x: 200,
            y: 280,
            size: 28,
            color: "#0f172a",
            font: SANS,
            weight: "normal",
            italic: true,
            rot: 0,
          },
        ],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
        updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
      },
    ],
    deliveries: [
      {
        id: "o-ravi-1",
        designId: "d-ravi-1",
        designName: "Mono Shirt",
        status: "delivered",
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 8,
        price: ORDER_PRICE,
      },
    ],
  },
  {
    id: "u-sky",
    name: "Sky",
    description: "Loves bright colors.",
    designs: [
      {
        id: "d-sky-1",
        name: "Sunny Tee",
        garment: "tshirt",
        garmentColor: "#f59e0b",
        elements: [
          {
            id: "e1",
            type: "text",
            text: "☀ SUNNY",
            x: 200,
            y: 260,
            size: 30,
            color: "#ffffff",
            font: SANS,
            weight: "bold",
            italic: false,
            rot: 0,
          },
        ],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
        updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      },
    ],
    deliveries: [
      {
        id: "o-sky-1",
        designId: "d-sky-1",
        designName: "Sunny Tee",
        status: "pending",
        createdAt: Date.now() - 1000 * 60 * 30,
        price: ORDER_PRICE,
      },
    ],
  },
];

const defaultState: AppState = {
  profile: {
    name: "Alex",
    description: "Designer in the making.",
  },
  designs: [],
  deliveries: [],
  mockUsers: mockUsersSeed,
};

let memoryState: AppState = defaultState;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Make sure deliveries always carry a price, even after upgrades. */
function normalizeDeliveries(list: Delivery[] | undefined): Delivery[] {
  return (list ?? []).map((d) => ({
    ...d,
    price: typeof d.price === "number" ? d.price : ORDER_PRICE,
  }));
}

/**
 * Older saved designs were stored before rotation / stroke transforms
 * existed. Backfill `rot=0` (and stroke x/y/w/h from its path bbox) so the
 * editor doesn't crash reading them.
 */
function normalizeDesigns(
  list: AppState["designs"] | undefined
): AppState["designs"] {
  return (list ?? []).map((d) => ({
    ...d,
    elements: d.elements.map((el) => {
      if (el.type === "stroke") {
        const needs =
          typeof el.x !== "number" ||
          typeof el.y !== "number" ||
          typeof el.w !== "number" ||
          typeof el.h !== "number";
        if (!needs) {
          return {
            ...el,
            rot: typeof el.rot === "number" ? el.rot : 0,
          };
        }
        const bbox = strokeBBox(el.d);
        return {
          ...el,
          x: typeof el.x === "number" ? el.x : bbox?.cx ?? 0,
          y: typeof el.y === "number" ? el.y : bbox?.cy ?? 0,
          w: typeof el.w === "number" ? el.w : bbox?.w ?? 0,
          h: typeof el.h === "number" ? el.h : bbox?.h ?? 0,
          rot: typeof el.rot === "number" ? el.rot : 0,
        };
      }
      return { ...el, rot: typeof el.rot === "number" ? el.rot : 0 };
    }),
  }));
}

function loadFromStorage(): AppState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      profile: { ...defaultState.profile, ...(parsed.profile ?? {}) },
      designs: normalizeDesigns(parsed.designs),
      deliveries: normalizeDeliveries(parsed.deliveries),
      // Seed mocks if absent from existing saves; keep edits if already present
      mockUsers:
        parsed.mockUsers && parsed.mockUsers.length > 0
          ? parsed.mockUsers.map((u) => ({
              ...u,
              designs: normalizeDesigns(u.designs),
              deliveries: normalizeDeliveries(u.deliveries),
            }))
          : mockUsersSeed,
    };
  } catch {
    return defaultState;
  }
}

function saveToStorage(state: AppState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function ensureHydrated() {
  if (hydrated) return;
  memoryState = loadFromStorage();
  hydrated = true;
}

function setState(updater: (s: AppState) => AppState) {
  ensureHydrated();
  memoryState = updater(memoryState);
  saveToStorage(memoryState);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AppState {
  ensureHydrated();
  return memoryState;
}

function getServerSnapshot(): AppState {
  return defaultState;
}

/** Subscribe to the entire app state. SSR-safe. */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Returns true once the client has mounted and read localStorage. */
export function useHydrated() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  return ok;
}

// ---- mutators ----------------------------------------------------------

export function updateProfile(patch: Partial<Profile>) {
  setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
}

export function saveDesign(design: Design) {
  setState((s) => {
    const idx = s.designs.findIndex((d) => d.id === design.id);
    const next = [...s.designs];
    if (idx >= 0) next[idx] = { ...design, updatedAt: Date.now() };
    else next.unshift({ ...design, updatedAt: Date.now() });
    return { ...s, designs: next };
  });
}

export function deleteDesign(id: string) {
  setState((s) => ({
    ...s,
    designs: s.designs.filter((d) => d.id !== id),
    deliveries: s.deliveries.filter((d) => d.designId !== id),
  }));
}

export function getDesign(id: string): Design | undefined {
  ensureHydrated();
  return memoryState.designs.find((d) => d.id === id);
}

export function addDelivery(delivery: Delivery) {
  setState((s) => ({
    ...s,
    deliveries: [
      { ...delivery, price: delivery.price ?? ORDER_PRICE },
      ...s.deliveries,
    ],
  }));
}

// ---- admin helpers -----------------------------------------------------

/** Update an order's status. Pass "self" for the current user, otherwise a mockUser id. */
export function updateOrderStatus(
  ownerId: "self" | string,
  orderId: string,
  status: DeliveryStatus
) {
  setState((s) => {
    if (ownerId === "self") {
      return {
        ...s,
        deliveries: s.deliveries.map((d) =>
          d.id === orderId ? { ...d, status } : d
        ),
      };
    }
    return {
      ...s,
      mockUsers: s.mockUsers.map((u) =>
        u.id === ownerId
          ? {
              ...u,
              deliveries: u.deliveries.map((d) =>
                d.id === orderId ? { ...d, status } : d
              ),
            }
          : u
      ),
    };
  });
}

/** Delete an order entirely. */
export function deleteOrder(ownerId: "self" | string, orderId: string) {
  setState((s) => {
    if (ownerId === "self") {
      return {
        ...s,
        deliveries: s.deliveries.filter((d) => d.id !== orderId),
      };
    }
    return {
      ...s,
      mockUsers: s.mockUsers.map((u) =>
        u.id === ownerId
          ? { ...u, deliveries: u.deliveries.filter((d) => d.id !== orderId) }
          : u
      ),
    };
  });
}

/** Reset the seeded mock users (handy for demo reset). */
export function resetMockUsers() {
  setState((s) => ({ ...s, mockUsers: mockUsersSeed }));
}

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

// Convenience hook returning helpers + state with stable references
export function useStore() {
  const state = useAppState();
  const _updateProfile = useCallback(updateProfile, []);
  const _saveDesign = useCallback(saveDesign, []);
  const _deleteDesign = useCallback(deleteDesign, []);
  const _addDelivery = useCallback(addDelivery, []);
  return {
    state,
    updateProfile: _updateProfile,
    saveDesign: _saveDesign,
    deleteDesign: _deleteDesign,
    addDelivery: _addDelivery,
  };
}
