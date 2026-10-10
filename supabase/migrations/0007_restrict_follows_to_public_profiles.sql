-- Private profiles need an approval workflow that is not implemented yet.
-- Until follow requests exist, reject new follows to private profiles.
create or replace function private.is_profile_public(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user_id and p.is_private = false
  );
$$;

revoke all on function private.is_profile_public(uuid) from public, anon;
grant execute on function private.is_profile_public(uuid) to authenticated;

drop policy if exists "follows_insert_self" on public.follows;
create policy "follows_insert_self" on public.follows
for insert to authenticated
with check (
  follower_id = (select auth.uid())
  and follower_id <> followed_id
  and private.is_profile_public(followed_id)
  and not private.is_blocked_pair(follower_id, followed_id)
);
