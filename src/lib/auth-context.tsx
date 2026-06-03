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
  /** Sign out of all sessions. */
  signOut: () => Promise<void>;
  /** Re-fetch the profile row (useful after a row update). */
  refreshProfile: () => Promise<void>;
}

/** Validate a username and turn it into the artificial email Supabase
 *  Auth stores. Returns null if the username is malformed. */
function usernameToEmail(username: string): string | null {
  const u = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(u)) return null;
  return `${u}@demoth.local`;
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

  // Track auth changes throughout the app's lifetime.
  useEffect(() => {
    let cancelled = false;

    // Initial session check on page load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        const p = await fetchProfile(sessionUser.id);
        if (!cancelled) setProfile(p);
      }
      if (!cancelled) setLoading(false);
    });

    // Subscribe to auth changes (sign in, sign out, token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event: string, session: Session | null) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          const p = await fetchProfile(sessionUser.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async (username: string, password: string, name?: string) => {
      const email = usernameToEmail(username);
      if (!email) {
        return {
          error:
            "Username must be 3-20 characters, only lowercase letters, digits, or underscore.",
        };
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Carried through to the auto-create-profile trigger so the
          // user's username and display name land in the profiles row.
          data: { username: username.trim().toLowerCase(), name: name?.trim() },
        },
      });
      if (error) {
        // Supabase says "User already registered" when the (fake) email
        // is in use. Translate that to a username-friendly message.
        if (/already registered/i.test(error.message)) {
          return { error: "That username is taken. Try another." };
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
      return { error: "Enter a valid username (letters, digits, underscore)." };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // Supabase says "Invalid login credentials" when password is
      // wrong OR account doesn't exist. Keep it generic so we don't
      // leak which usernames exist.
      if (/invalid login credentials/i.test(error.message)) {
        return { error: "Username or password is incorrect." };
      }
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
