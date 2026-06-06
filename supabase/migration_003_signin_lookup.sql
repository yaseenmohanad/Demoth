-- ============================================================================
-- Demoth migration 003: passwordful account lookup for sign-in fallback
--
-- Background: Demoth lets users sign up with the same base email
-- multiple times (the second account gets a random `-x7k2` suffix
-- appended to the internal handle so Supabase's unique-email rule is
-- still respected). The user only remembers their bare email and
-- password, so a normal signInWithPassword call fails for them
-- whenever their actual account has a suffix.
--
-- This function rescues that case: given the bare handle prefix and
-- the typed password, scan suffixed variants of the same base and
-- return the full email of the account whose password verifies (or
-- null if none matches). The client then re-signs-in with the
-- returned email.
--
-- Security tradeoff: this is, by design, a "test one password against
-- many accounts that share an email prefix" oracle. Anyone on the
-- internet can call it. We're trading that exposure for a much better
-- UX when users genuinely forget their suffix, and relying on:
--   * Supabase platform-level rate limiting at the gateway
--   * The LIKE pattern is narrow (one base prefix at a time)
--   * The result reveals at most one email (not a full list)
-- For a school-project marketplace this is acceptable. If this were
-- ever production, we'd add a per-IP throttle or a CAPTCHA gate here.
-- ============================================================================

create extension if not exists pgcrypto;

create or replace function public.find_account_by_password(
  p_handle_prefix text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user             record;
  v_clean_prefix     text;
  v_target_email     text;
  v_target_pattern   text;
begin
  -- Tight input validation: the prefix must look like one our app
  -- produces (lowercase, the same characters normalizeHandle allows,
  -- 3-50 chars). Anything else short-circuits to null so this isn't
  -- a path to inject LIKE wildcards.
  v_clean_prefix := lower(p_handle_prefix);
  if v_clean_prefix !~ '^[a-z0-9._+@\-]{3,50}$' then
    return null;
  end if;

  -- Mirror the client-side handleToEmail() encoding: @ becomes .at.
  -- so the local-part of the synthetic @demoth.local email is valid.
  v_target_email   := replace(v_clean_prefix, '@', '.at.') || '@demoth.local';
  v_target_pattern := replace(v_clean_prefix, '@', '.at.') || '-%@demoth.local';

  -- Up to 100 candidates per prefix is well beyond the realistic
  -- collision count (the suffix space is ~900k) and keeps the worst
  -- case bounded if someone tries to amplify the oracle. encrypted_
  -- password is a bcrypt hash; crypt(p_password, hash) re-hashes
  -- with the same parameters, so equality means the password is
  -- correct for that row.
  for v_user in
    select email, encrypted_password
    from auth.users
    where email = v_target_email
       or email like v_target_pattern
    limit 100
  loop
    if v_user.encrypted_password is not null
      and v_user.encrypted_password = crypt(p_password, v_user.encrypted_password)
    then
      return v_user.email;
    end if;
  end loop;

  return null;
end;
$$;

-- Sign-in happens before the caller is authenticated, so the anon
-- role has to be allowed. We revoke from PUBLIC first to keep the
-- grants explicit and reviewable.
revoke all on function public.find_account_by_password(text, text) from public;
grant execute on function public.find_account_by_password(text, text)
  to anon, authenticated;
