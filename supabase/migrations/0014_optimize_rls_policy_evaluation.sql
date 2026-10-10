-- Avoid per-row auth function evaluation and remove overlapping admin ALL policies.
-- Admin permissions remain explicit, including deletion where previously allowed by ALL.
drop policy if exists "videos_admin_all" on public.videos;
drop policy if exists "rooms_admin_all" on public.rooms;

drop policy if exists "videos_select_visible_or_owner" on public.videos;
create policy "videos_select_visible_or_owner" on public.videos
for select to anon, authenticated
using (
  (status = 'approved' and is_paid = false and visibility = 'public')
  or owner_id = (select auth.uid())
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);

drop policy if exists "videos_insert_pending_self" on public.videos;
create policy "videos_insert_pending_self" on public.videos
for insert to authenticated
with check (
  (owner_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null)
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);

drop policy if exists "videos_update_pending_self" on public.videos;
create policy "videos_update_pending_self" on public.videos
for update to authenticated
using (
  (owner_id = (select auth.uid()) and status = 'pending')
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
)
with check (
  (owner_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null)
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);
drop policy if exists "videos_admin_delete" on public.videos;
create policy "videos_admin_delete" on public.videos
for delete to authenticated
using (coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false));

drop policy if exists "rooms_select_live_or_host" on public.rooms;
create policy "rooms_select_live_or_host" on public.rooms
for select to anon, authenticated
using (
  (status = 'live' and visibility = 'public')
  or host_id = (select auth.uid())
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);

drop policy if exists "rooms_insert_pending_host" on public.rooms;
create policy "rooms_insert_pending_host" on public.rooms
for insert to authenticated
with check (
  (host_id = (select auth.uid()) and status = 'pending' and provider_room_ref is null)
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);

drop policy if exists "rooms_update_pending_host" on public.rooms;
create policy "rooms_update_pending_host" on public.rooms
for update to authenticated
using (
  (host_id = (select auth.uid()) and status = 'pending')
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
)
with check (
  (host_id = (select auth.uid()) and status = 'pending' and provider_room_ref is null)
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);
drop policy if exists "rooms_admin_delete" on public.rooms;
create policy "rooms_admin_delete" on public.rooms
for delete to authenticated
using (coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false));

drop policy if exists "room_members_select_self_or_host" on public.room_members;
create policy "room_members_select_self_or_host" on public.room_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.rooms r where r.id = room_members.room_id and r.host_id = (select auth.uid()))
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);

drop policy if exists "reports_admin_update" on public.reports;
create policy "reports_admin_update" on public.reports
for update to authenticated
using (coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false))
with check (coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false));

drop policy if exists "reports_select_self_or_admin" on public.reports;
create policy "reports_select_self_or_admin" on public.reports
for select to authenticated
using (
  reporter_id = (select auth.uid())
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);

drop policy if exists "purchases_select_buyer_or_admin" on public.purchases;
create policy "purchases_select_buyer_or_admin" on public.purchases
for select to authenticated
using (
  buyer_id = (select auth.uid())
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);
