-- ============================================================================
-- Demoth migration 008: OAuth-friendly signup trigger
--
-- Google sign-in creates auth.users rows whose email is a real Google
-- address and whose metadata includes `name`, `full_name`, `avatar_url`,
-- and `picture`. The existing handle_new_user trigger (from migration
-- 001) handled only the username/password flow — if a Google user's
-- email prefix collided with an existing username, the whole OAuth
-- signin failed with a UNIQUE_VIOLATION. This rewrite:
--
--   • Retries the username with a short random suffix on collision
--   • Pulls the display name from `name` or `full_name`
--   • Stores the Google avatar on the profile row
--
-- Safe to re-run.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base     text;
  v_username text;
  v_name     text;
  v_avatar   text;
begin
  -- Prefer a username the client explicitly supplied (classic sign-up).
  -- Fall back to the email prefix for OAuth users who never typed one.
  v_base := coalesce(
    new.raw_user_meta_data->>'username',
    lower(split_part(new.email, '@', 1)),
    'user'
  );
  -- Clamp to 45 chars so a 5-char "-xxxx" suffix stays within the
  -- app's HANDLE_RE length budget.
  v_base := left(v_base, 45);

  -- Try the plain base first; on collision, retry with a 4-char suffix
  -- up to 6 times. The alphabet is ~900k combos per attempt, so
  -- running out is effectively impossible.
  v_username := v_base;
  for i in 1..6 loop
    exit when not exists (
      select 1 from public.profiles where username = v_username
    );
    v_username := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  end loop;

  v_name := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    v_base
  );

  -- Google OAuth puts the profile picture in both `avatar_url` and
  -- `picture`; take whichever is present.
  v_avatar := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );

  insert into public.profiles (id, name, username, avatar)
  values (new.id, v_name, v_username, v_avatar);
  return new;
end;
$$;
