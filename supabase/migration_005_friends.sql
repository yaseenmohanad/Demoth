-- ============================================================================
-- Demoth migration 005: friends system (Phase 3)
--
-- Adds the directory toggles, the friend_requests table, and updates
-- the designs SELECT policy so accepted friends can see each other's
-- private designs when share_wardrobe is on.
--
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Profile flags ---------------------------------------------------------
-- show_on_friends: appear in the Discover directory? Default true so
-- new accounts are findable. Users can opt out from Settings.
-- share_wardrobe: do accepted friends get to see my unpublished designs?
-- Default false — opt-in sharing.
alter table public.profiles
  add column if not exists show_on_friends boolean not null default true;
alter table public.profiles
  add column if not exists share_wardrobe  boolean not null default false;

-- 2. friend_requests table -------------------------------------------------
-- One row per request. Pending requests become "accepted" or "denied"
-- after the recipient responds; we keep the row around (don't delete)
-- so the sender gets a notification in their inbox and the system
-- knows who's friends with whom. "Are X and Y friends?" =
-- `exists (status='accepted' row joining the two ids in either order)`.
create table if not exists public.friend_requests (
  id            uuid        primary key default gen_random_uuid(),
  sender_id     uuid        not null references public.profiles(id) on delete cascade,
  recipient_id  uuid        not null references public.profiles(id) on delete cascade,
  status        text        not null default 'pending' check (status in ('pending', 'accepted', 'denied')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (sender_id <> recipient_id)
);

-- Only one *pending* request per directed pair. Denied/accepted rows
-- can accumulate (they're notification history) but you can't spam
-- the same person with pending invites.
create unique index if not exists friend_requests_pending_pair_idx
  on public.friend_requests (sender_id, recipient_id)
  where status = 'pending';

-- Speed up the inbox/friends queries.
create index if not exists friend_requests_recipient_status_idx
  on public.friend_requests (recipient_id, status, responded_at desc);
create index if not exists friend_requests_sender_status_idx
  on public.friend_requests (sender_id, status, responded_at desc);

alter table public.friend_requests enable row level security;

-- Sender and recipient can both read the row (sender needs to see
-- "accepted/denied" notifications, recipient needs to see incoming
-- pending requests). Nobody else sees friend_requests.
drop policy if exists "friend_requests_select" on public.friend_requests;
create policy "friend_requests_select" on public.friend_requests
  for select to authenticated using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

-- A user can only send a request as themselves.
drop policy if exists "friend_requests_insert" on public.friend_requests;
create policy "friend_requests_insert" on public.friend_requests
  for insert to authenticated with check (
    auth.uid() = sender_id
  );

-- Only the recipient can change status (accept / deny). They can't
-- change who the request is from / to, only the status — but we
-- don't enforce field-level immutability here; the app updates only
-- status + responded_at.
drop policy if exists "friend_requests_update" on public.friend_requests;
create policy "friend_requests_update" on public.friend_requests
  for update to authenticated using (
    auth.uid() = recipient_id
  );

-- 3. Updated designs SELECT policy for share_wardrobe ----------------------
-- Now also allow read when the design's owner has share_wardrobe=true
-- AND the viewer is an accepted friend of the owner. Marketplace
-- (published=true) and own-design access stay unchanged.
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
  );
