"use client";

/**
 * Tracks "accounts saved on this device" — the list that powers the
 * account switcher on the Profile page. Whenever a user signs in we
 * store their session tokens here so the same browser can hop between
 * accounts later without re-typing the password each time. Signing out
 * clears the active Supabase session but leaves the saved entry intact;
 * removing an entry forgets the account on this device entirely (the
 * account itself still exists in Supabase).
 *
 * Persisted in localStorage under a single key. Each entry holds the
 * refresh token (long-lived, ~30 days) and access token (short-lived).
 * setSession() can resume from either pair.
 */

const STORAGE_KEY = "demoth.saved-accounts.v1";

export interface SavedAccount {
  id: string;
  /** The username the user signed up with — handy for showing them
   *  which account they're switching to. */
  username: string;
  /** Display name to show in the switcher list. */
  name: string;
  /** Avatar data URL if any (we copy it in so the switcher doesn't have
   *  to fetch from Supabase before rendering). */
  avatar: string | null;
  accessToken: string;
  refreshToken: string;
  /** When this account was last saved/refreshed on the device. Used to
   *  show recently-used accounts first. */
  addedAt: number;
}

function read(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedAccount[];
  } catch {
    return [];
  }
}

function write(accounts: SavedAccount[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // Quota or serialization error — ignore; we lose the list but
    // nothing else breaks.
  }
}

export function getSavedAccounts(): SavedAccount[] {
  return read().sort((a, b) => b.addedAt - a.addedAt);
}

/** Upsert an account in the saved list. Same id replaces the prior
 *  entry (e.g. token refresh). */
export function upsertSavedAccount(account: SavedAccount) {
  const list = read();
  const without = list.filter((a) => a.id !== account.id);
  without.push(account);
  write(without);
}

export function removeSavedAccount(id: string) {
  const list = read().filter((a) => a.id !== id);
  write(list);
}

export function clearSavedAccounts() {
  write([]);
}
