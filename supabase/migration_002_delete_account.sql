-- ============================================================================
-- Demoth migration 002: user-callable delete-my-account RPC
--
-- Lets a signed-in user delete their own account from inside the app
-- after re-typing their password. The function verifies the password
-- against the encrypted_password stored on auth.users (Supabase uses
-- bcrypt via pgcrypto, so `crypt(p, hash) = hash` is the standard
-- verification check), then deletes the auth.users row. Profiles +
-- designs + deliveries all cascade via their existing ON DELETE
-- CASCADE foreign keys.
--
-- We use SECURITY DEFINER so the function can touch auth.users —
-- authenticated users can't normally write there directly. The
-- function still scopes everything to the calling user via auth.uid(),
-- so it can only delete the caller's own account.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- pgcrypto provides the crypt() function we use to verify the password.
-- Supabase enables this on every project by default but the CREATE EXTENSION
-- is idempotent and harmless if it's already there.
create extension if not exists pgcrypto;

create or replace function public.delete_my_account(p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id    uuid := auth.uid();
  v_hash       text;
begin
  if v_user_id is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Pull the bcrypt hash for the calling user and compare against the
  -- password they just typed. crypt() with the stored hash as salt
  -- re-hashes the plaintext using the same parameters; equality means
  -- the passwords match.
  select encrypted_password into v_hash
  from auth.users
  where id = v_user_id;

  if v_hash is null or v_hash <> crypt(p_password, v_hash) then
    raise exception 'Password incorrect' using errcode = '28P01';
  end if;

  -- Cascades through public.profiles / public.designs /
  -- public.deliveries via the ON DELETE CASCADE FKs declared in
  -- schema.sql, so we don't need to delete those explicitly.
  delete from auth.users where id = v_user_id;
end;
$$;

-- Only authenticated users can call this. anon would have auth.uid() = null
-- and hit the "Not signed in" branch anyway, but the explicit grant keeps
-- the surface tight.
revoke all on function public.delete_my_account(text) from public;
grant execute on function public.delete_my_account(text) to authenticated;
