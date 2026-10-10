-- XLive 18 initial schema for Supabase Postgres.
-- Apply through Supabase SQL Editor only after creating a project.
-- Admin privileges are read from app_metadata (server-controlled), never user_metadata.
begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null default '' check (char_length(display_name) <= 60),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_path text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_no_self check (follower_id <> followed_id)
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  storage_path text not null unique,
  preview_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','removed')),
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  is_paid boolean not null default false,
  price_cents integer check (price_cents is null or price_cents between 1 and 1000000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_video_has_price check (is_paid = false or price_cents is not null),
  constraint video_storage_path_owner check (storage_path like owner_id::text || '/%'),
  constraint video_preview_path_owner check (preview_path is null or preview_path like owner_id::text || '/%')
);

create index if not exists videos_public_feed_idx on public.videos (created_at desc)
  where status = 'approved' and is_paid = false and visibility = 'public';
create index if not exists videos_owner_idx on public.videos (owner_id, created_at desc);
create index if not exists follows_followed_idx on public.follows (followed_id, follower_id);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  media_mode text not null check (media_mode in ('audio','video')),
  visibility text not null default 'public' check (visibility in ('public','private')),
  status text not null default 'pending' check (status in ('pending','live','ended','cancelled')),
  capacity integer not null default 8 check (capacity between 2 and 50),
  provider_room_ref text unique,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint room_times_valid check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index if not exists rooms_live_feed_idx on public.rooms (created_at desc)
  where status = 'live' and visibility = 'public';

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'participant' check (member_role in ('host','moderator','participant')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile','video','room','message')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 100),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  moderator_id uuid references public.profiles(id) on delete set null,
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('follow','video_approved','video_rejected','room_invite','system','purchase')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1000),
  target_type text,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- Purchase records are written only by trusted server-side payment verification.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  video_id uuid not null references public.videos(id) on delete restrict,
  provider text not null,
  provider_payment_ref text unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded','disputed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint one_purchase_per_video_per_buyer unique (buyer_id, video_id)
);

create index if not exists purchases_buyer_idx on public.purchases (buyer_id, created_at desc);

-- Keep updated_at server-managed.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at before update on public.videos
for each row execute function public.set_updated_at();

-- New accounts get a profile. Username is a safe unique fallback and can be changed later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_name text;
  candidate text;
begin
  base_name := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base_name) < 3 then
    base_name := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  base_name := substr(base_name, 1, 24);
  candidate := base_name;
  if exists (select 1 from public.profiles p where p.username = candidate) then
    candidate := substr(base_name, 1, 18) || '_' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security is mandatory for every table exposed through the API.
alter table public.profiles enable row level security;
alter table public.user_blocks enable row level security;
alter table public.follows enable row level security;
alter table public.videos enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.purchases enable row level security;

-- Profiles: public profile fields only; no email or private auth data is stored here.
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
for select to anon, authenticated using (true);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Blocks are private to the person who created them.
drop policy if exists "blocks_select_self" on public.user_blocks;
create policy "blocks_select_self" on public.user_blocks
for select to authenticated using (blocker_id = (select auth.uid()));
drop policy if exists "blocks_insert_self" on public.user_blocks;
create policy "blocks_insert_self" on public.user_blocks
for insert to authenticated
with check (blocker_id = (select auth.uid()));
drop policy if exists "blocks_delete_self" on public.user_blocks;
create policy "blocks_delete_self" on public.user_blocks
for delete to authenticated using (blocker_id = (select auth.uid()));

-- SECURITY DEFINER lets the follow check see blocks from either side without exposing block lists.
create or replace function public.is_blocked_pair(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
$;
revoke all on function public.is_blocked_pair(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- Follow graph: users can create/remove only their own follows; self-follows are forbidden.
drop policy if exists "follows_select_public" on public.follows;
create policy "follows_select_public" on public.follows
for select to anon, authenticated using (true);
drop policy if exists "follows_insert_self" on public.follows;
create policy "follows_insert_self" on public.follows
for insert to authenticated
with check (
  follower_id = (select auth.uid())
  and follower_id <> followed_id
  and not public.is_blocked_pair(follower_id, followed_id)
);
drop policy if exists "follows_delete_self" on public.follows;
create policy "follows_delete_self" on public.follows
for delete to authenticated using (follower_id = (select auth.uid()));

-- Video originals remain private. Only approved, free, public metadata is visible in feeds.
drop policy if exists "videos_select_visible_or_owner" on public.videos;
create policy "videos_select_visible_or_owner" on public.videos
for select to authenticated, anon
using (
  (status = 'approved' and is_paid = false and visibility = 'public')
  or owner_id = (select auth.uid())
  or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);
drop policy if exists "videos_insert_pending_self" on public.videos;
create policy "videos_insert_pending_self" on public.videos
for insert to authenticated
with check (owner_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists "videos_update_pending_self" on public.videos;
create policy "videos_update_pending_self" on public.videos
for update to authenticated
using (owner_id = (select auth.uid()) and status = 'pending')
with check (owner_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists "videos_admin_all" on public.videos;
create policy "videos_admin_all" on public.videos
for all to authenticated
using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false))
with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

-- Only pending rooms can be created/edited by their host. A trusted backend must
-- issue LiveKit tokens and transition a room to live/ended after provider verification.
drop policy if exists "rooms_select_live_or_host" on public.rooms;
create policy "rooms_select_live_or_host" on public.rooms
for select to authenticated, anon
using (
  (status = 'live' and visibility = 'public')
  or host_id = (select auth.uid())
  or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);
drop policy if exists "rooms_insert_pending_host" on public.rooms;
create policy "rooms_insert_pending_host" on public.rooms
for insert to authenticated
with check (host_id = (select auth.uid()) and status = 'pending' and provider_room_ref is null);
drop policy if exists "rooms_update_pending_host" on public.rooms;
create policy "rooms_update_pending_host" on public.rooms
for update to authenticated
using (host_id = (select auth.uid()) and status = 'pending')
with check (host_id = (select auth.uid()) and status = 'pending' and provider_room_ref is null);
drop policy if exists "rooms_admin_all" on public.rooms;
create policy "rooms_admin_all" on public.rooms
for all to authenticated
using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false))
with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

-- Membership rows and participant roles are backend-controlled, not client-writable.
drop policy if exists "room_members_select_self_or_host" on public.room_members;
create policy "room_members_select_self_or_host" on public.room_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.rooms r where r.id = room_id and r.host_id = (select auth.uid()))
  or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);

-- Reports: users may submit and view their own reports; moderators manage reports.
drop policy if exists "reports_insert_self" on public.reports;
create policy "reports_insert_self" on public.reports
for insert to authenticated
with check (reporter_id = (select auth.uid()) and status = 'open' and moderator_id is null);
drop policy if exists "reports_select_self_or_admin" on public.reports;
create policy "reports_select_self_or_admin" on public.reports
for select to authenticated
using (
  reporter_id = (select auth.uid())
  or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);
drop policy if exists "reports_admin_update" on public.reports;
create policy "reports_admin_update" on public.reports
for update to authenticated
using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false))
with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

-- Notifications are private and can only be marked read by their recipient.
drop policy if exists "notifications_select_recipient" on public.notifications;
create policy "notifications_select_recipient" on public.notifications
for select to authenticated using (recipient_id = (select auth.uid()));
drop policy if exists "notifications_update_recipient" on public.notifications;
create policy "notifications_update_recipient" on public.notifications
for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

-- Purchase rows are visible only to buyer/admin. No client INSERT/UPDATE policies:
-- trusted payment webhooks must validate provider signatures and amounts server-side.
drop policy if exists "purchases_select_buyer_or_admin" on public.purchases;
create policy "purchases_select_buyer_or_admin" on public.purchases
for select to authenticated
using (
  buyer_id = (select auth.uid())
  or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);

-- Explicit grants keep anonymous clients read-only on intended public data.
grant select on public.profiles, public.follows, public.videos, public.rooms to anon;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, update on public.videos to authenticated;
grant select, insert, update on public.rooms to authenticated;
grant select on public.room_members to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.purchases to authenticated;

commit;
