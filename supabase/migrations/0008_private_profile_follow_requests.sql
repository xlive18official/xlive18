-- Follow requests for private profiles. Requests are visible only to sender and recipient.
create table if not exists public.follow_requests (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint follow_requests_no_self check (requester_id <> target_id)
);
alter table public.follow_requests enable row level security;

drop policy if exists "follow_requests_select_participant" on public.follow_requests;
create policy "follow_requests_select_participant" on public.follow_requests
for select to authenticated
using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

drop policy if exists "follow_requests_insert_requester" on public.follow_requests;
create policy "follow_requests_insert_requester" on public.follow_requests
for insert to authenticated
with check (
  requester_id = (select auth.uid())
  and status = 'pending'
  and private.is_profile_public(target_id) = false
  and not private.is_blocked_pair(requester_id, target_id)
);

drop policy if exists "follow_requests_delete_participant" on public.follow_requests;
create policy "follow_requests_delete_participant" on public.follow_requests
for delete to authenticated
using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

create or replace function private.process_follow_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    if new.target_id <> auth.uid() then
      raise exception 'Only the target user can accept a follow request';
    end if;
    if private.is_blocked_pair(new.requester_id, new.target_id) then
      raise exception 'Cannot accept a follow request while either user blocks the other';
    end if;
    insert into public.follows (follower_id, followed_id)
    values (new.requester_id, new.target_id)
    on conflict do nothing;
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    if new.target_id <> auth.uid() then
      raise exception 'Only the target user can reject a follow request';
    end if;
  elsif new.status <> old.status then
    raise exception 'Unsupported follow request status transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.process_follow_request() from public, anon, authenticated;
drop trigger if exists follow_requests_process on public.follow_requests;
create trigger follow_requests_process
before update of status on public.follow_requests
for each row execute function private.process_follow_request();

drop policy if exists "follow_requests_update_target" on public.follow_requests;
create policy "follow_requests_update_target" on public.follow_requests
for update to authenticated
using (target_id = (select auth.uid()) and status = 'pending')
with check (target_id = (select auth.uid()) and status in ('accepted','rejected'));

create index if not exists follow_requests_target_status_idx
on public.follow_requests (target_id, status, created_at desc);

create or replace function public.remove_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followed_id = new.blocked_id)
     or (follower_id = new.blocked_id and followed_id = new.blocker_id);
  delete from public.follow_requests
  where (requester_id = new.blocker_id and target_id = new.blocked_id)
     or (requester_id = new.blocked_id and target_id = new.blocker_id);
  return new;
end;
$$;
