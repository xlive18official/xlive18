create or replace function public.search_profiles(search_term text)
returns table (id uuid, username text, display_name text, is_private boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.is_private
  from public.profiles p
  where auth.uid() is not null
    and char_length(trim(coalesce(search_term, ''))) between 2 and 64
    and (
      left(lower(p.username), char_length(trim(search_term))) = lower(trim(search_term))
      or left(lower(coalesce(p.display_name, '')), char_length(trim(search_term))) = lower(trim(search_term))
    )
    and p.id <> auth.uid()
    and (
      not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = p.id and b.blocked_id = auth.uid()
      )
      or exists (
        select 1 from public.user_blocks b
        where b.blocker_id = auth.uid() and b.blocked_id = p.id
      )
    )
  order by p.is_private asc, p.username asc
  limit 20;
$$;
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

create or replace function private.process_follow_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.target_id is distinct from old.target_id then
    raise exception 'Follow request participants are immutable';
  end if;
  if old.status <> 'pending' then
    raise exception 'Only pending follow requests can be changed';
  end if;
  if new.status not in ('accepted', 'rejected') then
    raise exception 'Unsupported follow request status transition';
  end if;
  if new.target_id <> auth.uid() then
    raise exception 'Only the target user can process a follow request';
  end if;
  if new.status = 'accepted' then
    if private.is_blocked_pair(new.requester_id, new.target_id) then
      raise exception 'Cannot accept a follow request while either user blocks the other';
    end if;
    insert into public.follows (follower_id, followed_id)
    values (new.requester_id, new.target_id)
    on conflict do nothing;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.process_follow_request() from public, anon, authenticated;
