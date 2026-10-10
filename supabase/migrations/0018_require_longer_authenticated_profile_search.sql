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
    and char_length(trim(coalesce(search_term, ''))) between 3 and 64
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
