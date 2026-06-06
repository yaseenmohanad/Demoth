-- ============================================================================
-- Demoth migration 004: real marketplace publishing
--
-- Adds a `published` flag on designs and opens up SELECT so anyone
-- (signed in or not) can browse published designs. Owners still see
-- all of their own designs regardless of state, so unpublished
-- drafts stay private.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Publish flag ----------------------------------------------------------
-- Default false: existing rows stay private. The marketplace listing
-- only ever queries WHERE published = true.
alter table public.designs
  add column if not exists published boolean not null default false;

-- Partial index for the "newest published, ordered by recency" query
-- that the Browse page runs on every load. Partial keeps the index
-- tiny even if 99% of designs are private.
create index if not exists designs_published_updated_idx
  on public.designs (updated_at desc)
  where published = true;

-- 2. SELECT policy opens up read for anon + authenticated -----------------
-- Old policy was "authenticated, true" which both leaked unpublished
-- drafts to other signed-in users AND blocked anon browsing entirely.
-- New policy: anyone can see a row if it's published OR they own it.
-- auth.uid() returns null for anon, so the OR short-circuits to just
-- `published = true` for them — exactly what we want.
drop policy if exists "designs_select" on public.designs;
create policy "designs_select" on public.designs
  for select to anon, authenticated
  using (published = true or auth.uid() = user_id);
