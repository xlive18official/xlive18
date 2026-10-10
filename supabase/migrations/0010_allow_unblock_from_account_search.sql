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
  order by p.is_private asc, p.username asc
  limit 20;
$$;
revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to anon, authenticated;
