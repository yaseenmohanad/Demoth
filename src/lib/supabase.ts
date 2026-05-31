import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client. Reads the public credentials from
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (both safe
 * to ship to the client — the anon key is rate-limited and gated by
 * Row Level Security policies on the database).
 *
 * Server-side code (e.g. route handlers that need admin access) should
 * create a separate client using the service_role key from a non-public
 * env var. We don't need that yet.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in development; in production a missing key means we
  // built without the env vars set (e.g. Netlify env not configured).
  // The app should still render — we just won't be able to talk to the
  // backend until the vars are present.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      "Supabase env vars not set — auth and database calls will fail. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-key",
  {
    auth: {
      // Persist the session in localStorage so the user stays signed in
      // across page reloads, and auto-refresh tokens before they expire.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // for magic-link / OAuth callbacks (future)
    },
  }
);

/** Quick check: are env vars present? Used by UI to gate auth flows. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
