"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { DbProfile } from "./database.types";
import {
  getSavedAccounts,
  upsertSavedAccount,
  removeSavedAccount,
  type SavedAccount,
} from "./saved-accounts";
import { setActiveUser } from "./store";

interface AuthState {
  /** The auth.users record (id, email, etc.). null when signed out. */
  user: User | null;
  /** The public.profiles row for the signed-in user. null when signed out
   *  or still loading. */
  profile: DbProfile | null;
  /** True while we're checking the initial session on first page load. */
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  /** Username/password sign-up. Creates a new auth.users + profile.
   *  Internally derives a fake unique email so Supabase Auth (which
   *  insists on unique emails) can keep working — users never see it.
   *
   *  If the email they typed is already taken, we auto-append a short
   *  random suffix (e.g. `-x7k2`) and try again. `finalUsername` in the
   *  return value is the actual handle they got — usually the same as
   *  what they typed, but with a suffix on collision. The UI should
   *  surface that to the user so they know how to sign in elsewhere. */
  signUp: (
    username: string,
    password: string,
    name?: string
  ) => Promise<{ error: string | null; finalUsername?: string }>;
  /** Username/password sign-in. */
  signIn: (
    username: string,
    password: string
  ) => Promise<{ error: string | null }>;
  /** End the current session. The account stays saved on this device
   *  in the switcher list so the user can hop back later without
   *  retyping their password. */
  signOut: () => Promise<void>;
  /** Re-fetch the profile row (useful after a row update). */
  refreshProfile: () => Promise<void>;
  /** All accounts that have signed in on this device, newest first.
   *  Updated whenever the user signs in or signs out. */
  savedAccounts: SavedAccount[];
  /** Resume one of the saved accounts (e.g. user picked from the
   *  switcher modal). Replaces the current session with the chosen
   *  account's stored refresh token. */
  switchAccount: (
    accountId: string
  ) => Promise<{ error: string | null }>;
  /** Remove an account from this device's switcher list. The account
   *  itself remains in Supabase — this just forgets the saved tokens. */
  forgetAccount: (accountId: string) => void;
}

/** Allowed characters for the user-typed handle (called "Email" in
 *  the UI but really a unique username under the hood). 3-50 chars. */
const HANDLE_RE = /^[a-z0-9._+@-]{3,50}$/;

/** Normalize + validate the raw user input. Returns null if the format
 *  is wrong. Doesn't touch the suffix logic — callers build the final
 *  Supabase email via {@link handleToEmail}. */
function normalizeHandle(username: string): string | null {
  const u = username.trim().toLowerCase();
  return HANDLE_RE.test(u) ? u : null;
}

/** Convert a normalized handle (possibly with a `-xxxx` suffix appended
 *  after collision) into the artificial Supabase email. We replace `@`
 *  with `.at.` because email local parts can't contain `@`. Result is
 *  deterministic so sign-in finds the same account every time. */
function handleToEmail(handle: string): string {
  return `${handle.replace(/@/g, ".at.")}@demoth.local`;
}

/** Generate a short random suffix used to disambiguate handles when
 *  two users sign up with the same email. Lowercase base32-ish alphabet
 *  with confusable characters (0, 1, l, i, o) removed so users can read
 *  the suffix back if shown to them. */
const SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomSuffix(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return out;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Hook for any component to grab the current signed-in user + profile. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

async function fetchProfile(userId: string): Promise<DbProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("fetchProfile error", error);
    return null;
  }
  return data as DbProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  /** Reads the saved-accounts list out of localStorage and pushes it
   *  into state. Called after any mutation so the UI stays in sync. */
  const refreshSaved = useCallback(() => {
    setSavedAccounts(getSavedAccounts());
  }, []);

  /** Save the current session into the device's switcher list so the
   *  user can hop back to this account later without re-entering the
   *  password. */
  const persistSession = useCallback(
    async (session: Session, profileForSession: DbProfile | null) => {
      const u = session.user;
      const fallbackName =
        (u.user_metadata as { name?: string })?.name ?? u.email ?? "Designer";
      const fallbackUsername =
        (u.user_metadata as { username?: string })?.username ??
        (u.email ? u.email.split("@")[0] : "user");
      upsertSavedAccount({
        id: u.id,
        username: profileForSession?.username ?? fallbackUsername,
        name: profileForSession?.name ?? fallbackName,
        avatar: profileForSession?.avatar ?? null,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        addedAt: Date.now(),
      });
      refreshSaved();
    },
    [refreshSaved]
  );

  // Track auth changes throughout the app's lifetime.
  useEffect(() => {
    let cancelled = false;

    // Initial session check on page load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      // Pin the local store to this user's bucket BEFORE we read any
      // profile data, so designs/profile/deliveries are scoped to the
      // right account from the very first render.
      setActiveUser(sessionUser?.id ?? null);
      if (sessionUser && session) {
        const p = await fetchProfile(sessionUser.id);
        if (!cancelled) {
          setProfile(p);
          // Refresh the saved-account entry with the freshly loaded
          // profile (so display name / avatar in the switcher stay
          // up to date).
          await persistSession(session, p);
        }
      }
      refreshSaved();
      if (!cancelled) setLoading(false);
    });

    // Subscribe to auth changes (sign in, sign out, token refresh).
    // Fast-path the user / activeUser updates synchronously so the UI
    // flips the instant the session changes, then fire off
    // fetchProfile + persistSession in the background. Awaiting them
    // here would extend the "submitting…" period on the sign-in form
    // by however long the Supabase REST round-trips take, which is
    // exactly the lag the user reported.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event: string, session: Session | null) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        setActiveUser(sessionUser?.id ?? null);
        if (sessionUser && session) {
          // Profile + saved-account refresh run in the background.
          // Page can navigate / render in the meantime; profile state
          // backfills when the row arrives.
          void fetchProfile(sessionUser.id).then((p) => {
            setProfile(p);
            void persistSession(session, p);
          });
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [persistSession, refreshSaved]);

  const signUp = useCallback(
    async (username: string, password: string, name?: string) => {
      const base = normalizeHandle(username);
      if (!base) {
        return {
          error:
            "Email must be 3-50 characters and only contain letters, digits, dot, underscore, @, +, or hyphen.",
        };
      }
      // Trim the base so a suffix can always fit inside the 50-char
      // handle budget (5 chars: "-xxxx").
      const safeBase = base.length > 45 ? base.slice(0, 45) : base;

      // First attempt uses what the user typed. On collision, retry with
      // a random suffix appended. Five suffix attempts is more than
      // enough — alphabet is ~900k combos, so a real collision needs
      // ~hundreds of thousands of existing accounts with the same base.
      //
      // Collision detection is subtle: with email confirmations OFF,
      // Supabase's anti-enumeration behavior means signUp can succeed
      // *without* an error in two duplicate-email cases:
      //   (a) password also matches an existing user  → returns that
      //       existing user + a real session (silently signs us in)
      //   (b) password differs                         → returns a fake
      //       user object with an empty identities[] and no session
      // We treat both as collisions and retry with a fresh suffix.
      for (let attempt = 0; attempt < 6; attempt++) {
        const finalUsername =
          attempt === 0 ? base : `${safeBase}-${randomSuffix()}`;
        const { data, error } = await supabase.auth.signUp({
          email: handleToEmail(finalUsername),
          password,
          options: {
            // Trigger reads these out of raw_user_meta_data to populate
            // the profiles row.
            data: { username: finalUsername, name: name?.trim() },
          },
        });

        if (error) {
          // Only the "already taken" branch should retry — pass everything
          // else (weak password, network, etc.) straight to the caller.
          if (!/already registered/i.test(error.message)) {
            return { error: error.message };
          }
          continue;
        }

        // Empty identities = silent collision. (data.user is still a
        // truthy object with an obfuscated id.)
        const identities = data.user?.identities ?? [];
        if (identities.length === 0) {
          // If Supabase accidentally signed us into the existing account
          // (case (a) above), sign out so the next iteration starts
          // clean and doesn't leave the user logged into someone else's
          // account.
          const { data: sessData } = await supabase.auth.getSession();
          if (sessData.session) {
            await supabase.auth.signOut();
          }
          continue;
        }

        return { error: null, finalUsername };
      }
      return {
        error:
          "Couldn't reserve a unique handle for that email. Try a slightly different one.",
      };
    },
    []
  );

  const signIn = useCallback(async (username: string, password: string) => {
    const base = normalizeHandle(username);
    if (!base) {
      return {
        error: "Enter a valid email.",
      };
    }
    const email = handleToEmail(base);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // Supabase returns the same error for "wrong password" and
      // "account doesn't exist" by design (so attackers can't enumerate
      // accounts). Pass that through with our own wording.
      if (/invalid login credentials/i.test(error.message)) {
        return { error: "Email or password is incorrect." };
      }
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    // The saved-account entry persists — leaving the user able to
    // switch back from the Profile page's account switcher without
    // re-typing credentials. The Supabase session itself is cleared.
    await supabase.auth.signOut();
    // Belt and suspenders: clear local React state and the store's
    // active-user pointer right away. Without this, the UI relies on
    // the async SIGNED_OUT event from supabase reaching the listener,
    // which sometimes lands a render-tick late and makes sign-out feel
    // like it "didn't work".
    setUser(null);
    setProfile(null);
    setActiveUser(null);
    refreshSaved();
  }, [refreshSaved]);

  const switchAccount = useCallback(
    async (accountId: string) => {
      const target = getSavedAccounts().find((a) => a.id === accountId);
      if (!target) {
        return { error: "That account isn't saved on this device." };
      }
      // setSession swaps the active session in place. We don't need to
      // signOut first — Supabase replaces the stored tokens.
      const { error } = await supabase.auth.setSession({
        access_token: target.accessToken,
        refresh_token: target.refreshToken,
      });

      // Auth-style failures (token expired, refresh rotated by a sign-in
      // elsewhere, account deleted, "Auth session missing!" after a stale
      // setSession) all mean the saved tokens for this account are dead.
      // Drop the entry so the user isn't stuck staring at an account
      // they can't get into, and surface a friendly message instead of
      // the raw Supabase string.
      //
      // We DON'T treat plain network errors the same way — those are
      // transient and the saved entry might still be usable on retry.
      const looksLikeDeadSession = (msg: string) =>
        /session missing|refresh.*invalid|invalid.*refresh|refresh.*not found|refresh_token_not_found|jwt|expired|unauthor|user not found/i.test(
          msg
        );

      if (error) {
        if (looksLikeDeadSession(error.message)) {
          removeSavedAccount(accountId);
          refreshSaved();
          return {
            error:
              "That account's session expired. Sign in again to add it back.",
          };
        }
        return { error: error.message };
      }

      // Don't rely on onAuthStateChange to fire here — some supabase-js
      // versions skip it when setSession was effectively a no-op refresh.
      // Re-read the session and update everything explicitly so the UI
      // is guaranteed to flip to the new account immediately. Profile
      // fetch + saved-account refresh happen in the background so the
      // switcher modal can close instantly.
      const { data: sessData } = await supabase.auth.getSession();
      const newSession = sessData.session;
      if (!newSession?.user) {
        // setSession succeeded per the call but the session vanished
        // immediately after — treat the same as a dead-session error
        // above so the switcher doesn't claim "switched!" while
        // leaving the user signed out.
        removeSavedAccount(accountId);
        refreshSaved();
        return {
          error:
            "Couldn't restore that account's session. Sign in again to add it back.",
        };
      }
      setUser(newSession.user);
      setActiveUser(newSession.user.id);
      void fetchProfile(newSession.user.id).then((p) => {
        setProfile(p);
        void persistSession(newSession, p);
      });
      return { error: null };
    },
    [refreshSaved, persistSession]
  );

  const forgetAccount = useCallback(
    (accountId: string) => {
      removeSavedAccount(accountId);
      refreshSaved();
    },
    [refreshSaved]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [user]);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    savedAccounts,
    switchAccount,
    forgetAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
