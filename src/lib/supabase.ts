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
// Demoth's Supabase project. The anon key is *designed* to be public —
// it ships in the client bundle either way, viewable by anyone who opens
// DevTools. Real security comes from the Row Level Security policies in
// supabase/schema.sql, which limit what the anon key can actually do.
//
// We prefer env vars when present (so local dev can override, and so we
// can rotate keys in the future without a code change), but fall back
// to these constants so the live build doesn't break when env vars
// aren't wired up on the host.
const FALLBACK_SUPABASE_URL = "https://kgjgyknhvoievnnrpxtc.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnamd5a25odm9pZXZubnJweHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDQ0NTAsImV4cCI6MjA5NTc4MDQ1MH0.RUc0I4YE_YxCnEWXg722aAlZKt_U9KbdMM4kkNl-Qb0";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_SUPABASE_ANON_KEY;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
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

/** Always true now that we have hardcoded fallback credentials. Kept
 *  as an exported constant so call sites don't break. */
export const isSupabaseConfigured = true;
