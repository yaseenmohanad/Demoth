-- ============================================================================
-- Demoth migration 007: back-of-garment elements + new garment types
--
-- Adds an elements_back jsonb column alongside the existing elements
-- column so a design can carry independent front/back artwork. New
-- garment values (jacket, pants, pjs, shorts) just need the CHECK
-- constraint relaxed — they're validated against the GarmentType
-- union client-side.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. elements_back column -------------------------------------------------
-- jsonb, defaults to []. Old rows get an empty back side.
alter table public.designs
  add column if not exists elements_back jsonb not null default '[]'::jsonb;

-- 2. Loosen the garment CHECK constraint ----------------------------------
-- The original schema restricted garment to ('tshirt', 'shirt'). Expand
-- it to the new set.
alter table public.designs
  drop constraint if exists designs_garment_check;

alter table public.designs
  add constraint designs_garment_check
    check (garment in ('tshirt', 'shirt', 'jacket', 'pants', 'pjs', 'shorts'));
