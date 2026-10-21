-- ============================================================================
-- Demoth migration 007: back-of-garment elements + new garment types
--
-- Adds an elements_back jsonb column alongside the existing elements
-- column so a design can carry independent front/back artwork, and
-- loosens the garment CHECK so jacket / pants / pjs / shorts are
-- accepted.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. elements_back column -------------------------------------------------
-- jsonb, defaults to []. Old rows get an empty back side.
alter table public.designs
  add column if not exists elements_back jsonb not null default '[]'::jsonb;

-- 2. Loosen the garment CHECK constraint ----------------------------------
-- The original schema restricted garment to ('tshirt', 'shirt'). We find
-- *whatever* check constraint is defined on the garment column (Postgres
-- auto-names inline CHECKs and the name differs between projects), drop
-- it, then add our own with a stable name.
do $$
declare
  cons record;
begin
  for cons in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'designs'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%garment%'
  loop
    execute format('alter table public.designs drop constraint %I', cons.conname);
  end loop;
end $$;

alter table public.designs
  add constraint designs_garment_check
    check (garment in ('tshirt', 'shirt', 'jacket', 'pants', 'pjs', 'shorts'));
