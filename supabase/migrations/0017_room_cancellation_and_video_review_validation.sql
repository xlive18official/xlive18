-- Hosts may cancel their own pending room requests but cannot mark them live.
drop policy if exists "rooms_update_pending_host" on public.rooms;
create policy "rooms_update_pending_host" on public.rooms
for update to authenticated
using (
  (host_id = (select auth.uid()) and status = 'pending')
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
)
with check (
  (host_id = (select auth.uid()) and status in ('pending','cancelled') and provider_room_ref is null)
  or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
);

create or replace function private.validate_video_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'Video review must include reviewer and timestamp';
    end if;
    if new.status = 'rejected' and coalesce(char_length(trim(new.rejection_reason)),0) < 3 then
      raise exception 'Rejected videos require a reason';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_video_review() from public, anon, authenticated;
drop trigger if exists videos_validate_review on public.videos;
create trigger videos_validate_review before update of status on public.videos
for each row execute function private.validate_video_review();
