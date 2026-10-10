-- A private profile is visible to its owner and approved followers, but not to arbitrary users.
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_select_public_anon" on public.profiles;
create policy "profiles_select_public_anon" on public.profiles
for select to anon
using (is_private = false);

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or is_private = false
  or (
    exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid())
        and f.followed_id = profiles.id
    )
    and not private.is_blocked_pair((select auth.uid()), profiles.id)
  )
);
