-- ============================================================================
-- Demoth migration 001: switch to username-based identity
--
-- Adds a unique `username` column to profiles so two people can share an
-- email (or have no email at all). Auth still goes through Supabase, but
-- the email field stored on auth.users becomes an internal artificial
-- value (<username>@demoth.local) — users never type or see it.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Add the column (nullable for now so existing rows survive).
alter table public.profiles
  add column if not exists username text;

-- 2. Backfill any existing rows from their auth.users.email prefix.
update public.profiles p
set username = lower(split_part(u.email, '@', 1)) || '_' || substr(p.id::text, 1, 4)
from auth.users u
where p.id = u.id and p.username is null;

-- 3. Lock it down: not null + unique.
alter table public.profiles
  alter column username set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_unique'
  ) then
    alter table public.profiles
      add constraint profiles_username_unique unique (username);
  end if;
end$$;

-- 4. Update the auto-create-profile trigger to set username from sign-up
--    metadata. If metadata doesn't carry one, fall back to the email
--    prefix so the constraint is never violated.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_name     text;
begin
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    lower(split_part(new.email, '@', 1)),
    'user_' || substr(new.id::text, 1, 6)
  );
  v_name := coalesce(
    new.raw_user_meta_data->>'name',
    v_username
  );
  insert into public.profiles (id, name, username)
  values (new.id, v_name, v_username);
  return new;
end;
$$;
