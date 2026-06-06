-- ============================================================================
-- Demoth migration 002: tighten function security per Security Advisor
--
-- Resolves two classes of warnings shown in the Supabase dashboard:
--
--   * "Function Search Path Mutable" on touch_updated_at — without an
--     explicit search_path, another role could plant a same-named
--     function on the session path and hijack the lookup. Pinning the
--     path to public + pg_temp removes that vector.
--
--   * "Public Can Execute SECURITY DEFINER Function" / "Signed-In Users
--     Can Execute" on handle_new_user — the trigger fires automatically
--     and doesn't care about EXECUTE grants, so we can revoke from the
--     world and only postgres (the function owner) is left.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
--
-- Note: rls_auto_enable() shows up with the same warnings but isn't a
-- Demoth-owned function (it was created when "Automatic RLS" was
-- toggled on at project setup). Leave it alone — it's managed by
-- Supabase and the warning is informational.
-- ============================================================================

-- 1. Pin search_path on touch_updated_at -----------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Revoke direct EXECUTE on the trigger function -------------------------
-- The on_auth_user_created trigger calls handle_new_user() as the
-- function owner regardless of EXECUTE grants, so this doesn't break
-- sign-up. It just closes the "anyone with a Supabase URL can call my
-- SECURITY DEFINER function" hole.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
