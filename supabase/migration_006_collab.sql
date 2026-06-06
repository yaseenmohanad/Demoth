-- ============================================================================
-- Demoth migration 006: collab editing invites (Phase 4)
--
-- Adds an `edit_invites` table so design owners can invite friends
-- to co-edit a specific design, and extends the designs read/write
-- RLS so accepted invitees can actually load + save the design.
--
-- Real-time cursor + state sync happens at the Supabase Realtime
-- broadcast/presence layer (no schema needed for that — it's a
-- pure pub/sub channel keyed by design id).
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. edit_invites table ----------------------------------------------------
create table if not exists public.edit_invites (
  id            uuid        primary key default gen_random_uuid(),
  sender_id     uuid        not null references public.profiles(id) on delete cascade,
  recipient_id  uuid        not null references public.profiles(id) on delete cascade,
  design_id     uuid        not null references public.designs(id) on delete cascade,
  status        text        not null default 'pending' check (status in ('pending', 'accepted', 'denied')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (sender_id <> recipient_id)
);

-- Only one pending invite per (sender, recipient, design). Accepted /
-- denied rows can accumulate so the inbox keeps a history.
create unique index if not exists edit_invites_pending_idx
  on public.edit_invites (sender_id, recipient_id, design_id)
  where status = 'pending';

create index if not exists edit_invites_recipient_status_idx
  on public.edit_invites (recipient_id, status, created_at desc);
create index if not exists edit_invites_sender_status_idx
  on public.edit_invites (sender_id, status, created_at desc);

alter table public.edit_invites enable row level security;

-- Both sender and recipient can read the row (sender to see the
-- verdict in their sent-list, recipient to see the inbox card).
drop policy if exists "edit_invites_select" on public.edit_invites;
create policy "edit_invites_select" on public.edit_invites
  for select to authenticated using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

-- Sender can insert, but only for a design they own. This is the
-- critical gate that stops anyone from inviting strangers to "edit"
-- a design they don't control.
drop policy if exists "edit_invites_insert" on public.edit_invites;
create policy "edit_invites_insert" on public.edit_invites
  for insert to authenticated with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.designs d
      where d.id = design_id and d.user_id = auth.uid()
    )
  );

-- Only the recipient can accept/deny. The app updates just status +
-- responded_at; we don't bother field-level locking those.
drop policy if exists "edit_invites_update" on public.edit_invites;
create policy "edit_invites_update" on public.edit_invites
  for update to authenticated using (
    auth.uid() = recipient_id
  );

-- 2. Extend designs RLS so accepted invitees can read + write -------------
-- A design row is visible if:
--   - it's published in the marketplace (anon allowed)
--   - the caller owns it
--   - the owner has share_wardrobe + the caller is a friend (Phase 3)
--   - OR an accepted edit_invite exists for this design and caller
-- And writable when:
--   - the caller owns it
--   - OR an accepted edit_invite exists for this design and caller
drop policy if exists "designs_select" on public.designs;
create policy "designs_select" on public.designs
  for select to anon, authenticated using (
    published = true
    or auth.uid() = user_id
    or exists (
      select 1
      from public.profiles p
      where p.id = designs.user_id
        and p.share_wardrobe = true
        and exists (
          select 1
          from public.friend_requests fr
          where fr.status = 'accepted'
            and (
              (fr.sender_id = auth.uid() and fr.recipient_id = designs.user_id)
              or (fr.recipient_id = auth.uid() and fr.sender_id = designs.user_id)
            )
        )
    )
    or exists (
      select 1
      from public.edit_invites ei
      where ei.design_id = designs.id
        and ei.recipient_id = auth.uid()
        and ei.status = 'accepted'
    )
  );

-- UPDATE policy: owner OR accepted invitee. The accepted-invitee
-- branch is what lets two people co-edit the same design without
-- elaborate token-passing.
drop policy if exists "designs_update_own" on public.designs;
create policy "designs_update_own" on public.designs
  for update to authenticated using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.edit_invites ei
      where ei.design_id = designs.id
        and ei.recipient_id = auth.uid()
        and ei.status = 'accepted'
    )
  );
