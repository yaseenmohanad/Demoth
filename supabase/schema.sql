-- ============================================================================
-- Demoth database schema (MVP accounts)
--
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste →
-- Run. Re-running it is safe; everything is idempotent via DROP+CREATE for
-- policies and IF NOT EXISTS for tables.
-- ============================================================================

-- 1. profiles -----------------------------------------------------------------
-- Extends auth.users with the per-user app data we used to keep in
-- localStorage (display name, avatar, premium, etc.). Primary key is the
-- auth.users.id, so a user's profile is always 1:1 with their account.

create table if not exists public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  name          text        not null default 'Designer',
  description   text        not null default '',
  avatar        text,
  premium       boolean     not null default false,
  auto_correct  boolean     not null default true,
  is_admin      boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone signed in can see anyone's profile (so usernames render on
-- other people's designs). Only the owner can modify their own profile.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- 2. designs ------------------------------------------------------------------
-- A design is a serialized Demoth design (garment + element list, both stored
-- as jsonb so we can evolve the schema in the app without DB migrations).

create table if not exists public.designs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  name          text        not null default 'Untitled design',
  garment       text        not null check (garment in ('tshirt', 'shirt')),
  garment_color text        not null default '#ffffff',
  elements      jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists designs_user_id_idx on public.designs(user_id);
create index if not exists designs_updated_at_idx on public.designs(updated_at desc);

alter table public.designs enable row level security;

-- Designs are public-read so the "other designs" marketplace works. Only the
-- owner can change their own designs.
drop policy if exists "designs_select" on public.designs;
create policy "designs_select" on public.designs
  for select to authenticated using (true);

drop policy if exists "designs_insert_own" on public.designs;
create policy "designs_insert_own" on public.designs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "designs_update_own" on public.designs;
create policy "designs_update_own" on public.designs
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "designs_delete_own" on public.designs;
create policy "designs_delete_own" on public.designs
  for delete to authenticated using (auth.uid() = user_id);

-- 3. deliveries ---------------------------------------------------------------
-- Orders. The design_id reference is nullable so deleting a design doesn't
-- delete the order history. The design_name column is a snapshot of the
-- name at order time so history still reads sensibly even after rename.

create table if not exists public.deliveries (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  design_id   uuid        references public.designs(id) on delete set null,
  design_name text        not null,
  status      text        not null default 'pending' check (
    status in ('pending', 'shipped', 'delivered', 'cancelled')
  ),
  price       numeric(10, 2) not null default 9.00,
  created_at  timestamptz not null default now()
);

create index if not exists deliveries_user_id_idx on public.deliveries(user_id);

alter table public.deliveries enable row level security;

-- A user sees their own orders by default; admins see everyone's so the
-- admin panel works. Same split for update (so admins can change statuses).
drop policy if exists "deliveries_select" on public.deliveries;
create policy "deliveries_select" on public.deliveries
  for select to authenticated using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "deliveries_insert_own" on public.deliveries;
create policy "deliveries_insert_own" on public.deliveries
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "deliveries_update_admin" on public.deliveries;
create policy "deliveries_update_admin" on public.deliveries
  for update to authenticated using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "deliveries_delete_admin" on public.deliveries;
create policy "deliveries_delete_admin" on public.deliveries
  for delete to authenticated using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- 4. Auto-create profile on signup -------------------------------------------
-- Without this, a user signs up but has no profile row. The trigger fires
-- whenever a new auth.users row appears and inserts a matching profile.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    -- Default name = whatever they put in "name" metadata, or the email
    -- before the @, or just "Designer".
    coalesce(
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'Designer'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. updated_at auto-touch ----------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_designs_updated_at on public.designs;
create trigger touch_designs_updated_at
  before update on public.designs
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Done. Next steps in the Supabase dashboard:
--
--   1. Authentication → Providers → Email — make sure "Enable email signup"
--      is ON, and "Confirm email" is OFF (no email verification for now).
--   2. After your first sign-up, run:
--          update public.profiles set is_admin = true where id = '<your-uuid>';
--      to make yourself the admin. Find your UUID in Authentication → Users.
-- ============================================================================
