-- Allow each user to upload, display, replace, and remove their own profile avatar.
begin;

grant update (avatar_path) on public.profiles to authenticated;

drop policy if exists "photo_originals_select_profile_avatars" on storage.objects;
create policy "photo_originals_select_profile_avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'photo-originals'
  and exists (
    select 1
    from public.profiles p
    where p.avatar_path = objects.name
      and (p.id = (select auth.uid()) or p.is_private = false)
  )
);

commit;
