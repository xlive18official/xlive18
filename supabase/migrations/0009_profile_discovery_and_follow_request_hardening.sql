-- Minimal account discovery for follow requests without exposing private bios or other fields.
create or replace function public.search_profiles(search_term text)
returns table (id uuid, username text, display_name text, is_private boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.is_private
  from public.profiles p
  where char_length(trim(coalesce(search_term, ''))) between 2 and 64
    and (
      lower(p.username) like '%' || lower(trim(search_term)) || '%'
      or lower(p.display_name) like '%' || lower(trim(search_term)) || '%'
    )
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not (auth.uid() is not null and private.is_blocked_pair(auth.uid(), p.id))
  order by p.is_private asc, p.username asc
  limit 20;
$$;
revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to anon, authenticated;

-- Prevent clients from changing request participants while updating status.
create or replace function private.process_follow_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requester_id is distinct from old.requester_id or new.target_id is distinct from old.target_id then
    raise exception 'Follow request participants are immutable';
  end if;
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
