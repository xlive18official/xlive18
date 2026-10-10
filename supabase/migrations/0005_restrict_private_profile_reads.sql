-- Restrict profile reads according to account privacy.
-- Owners can always read their own profile; everyone else can read public profiles only.
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
for select to anon, authenticated
using (id = (select auth.uid()) or is_private = false);
