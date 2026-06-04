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
   *  insists on unique emails) can keep working — users never see it. */
  signUp: (
    username: string,
    password: string,
    name?: string
  ) => Promise<{ error: string | null }>;
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

/**
 * Convert the user-typed "email" (which is really a username — accepts
 * any letters/digits/dots/underscores/hyphens/@/+ between 3 and 50
 * chars) into the artificial Supabase email used for auth. We replace
 * `@` with `.at.` because email local parts can't contain `@`, but the
 * result is still a deterministic 1:1 mapping so sign-in finds the
 * same account every time.
 *
 * Returns null when the input doesn't pass the format check.
 */
function usernameToEmail(username: string): string | null {
  const u = username.trim().toLowerCase();
  if (!/^[a-z0-9._+@-]{3,50}$/.test(u)) return null;
  const local = u.replace(/@/g, ".at.");
  return `${local}@demoth.local`;
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

    // Subscribe to auth changes (sign in, sign out, token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event: string, session: Session | null) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser && session) {
          const p = await fetchProfile(sessionUser.id);
          setProfile(p);
          // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED all keep the
          // device list current. SIGNED_OUT doesn't reach this branch.
          await persistSession(session, p);
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
      const email = usernameToEmail(username);
      if (!email) {
        return {
          error:
            "Email must be 3-50 characters and only contain letters, digits, dot, underscore, @, +, or hyphen.",
        };
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Carried through to the auto-create-profile trigger so the
          // user's chosen identifier and display name land in the
          // profiles row.
          data: { username: username.trim().toLowerCase(), name: name?.trim() },
        },
      });
      if (error) {
        if (/already registered/i.test(error.message)) {
          return { error: "That email is already taken. Try another." };
        }
        return { error: error.message };
      }
      return { error: null };
    },
    []
  );

  const signIn = useCallback(async (username: string, password: string) => {
    const email = usernameToEmail(username);
    if (!email) {
      return {
        error: "Enter a valid email.",
      };
    }
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
      if (error) {
        // Token expired or the account was deleted server-side. Drop
        // the dead entry so the switcher doesn't keep offering it.
        if (
          /refresh.*invalid|jwt expired|not found/i.test(error.message)
        ) {
          removeSavedAccount(accountId);
          refreshSaved();
        }
        return { error: error.message };
      }
      return { error: null };
    },
    [refreshSaved]
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
