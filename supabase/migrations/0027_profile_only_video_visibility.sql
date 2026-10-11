-- Add profile-only visibility while preserving private storage and moderation.
alter table public.videos drop constraint if exists videos_visibility_check;
alter table public.videos add constraint videos_visibility_check
  check (visibility in ('public','profile','followers','private'));

-- Let signed-in visitors list approved free video metadata for profile cards.
-- Private videos are displayed as locked cards; this policy does not grant file access.
drop policy if exists videos_select_visible_or_owner on public.videos;
create policy videos_select_visible_or_owner
on public.videos for select to authenticated
using (
  (status = 'approved' and is_paid = false and visibility in ('public','profile','private'))
  or owner_id = (select auth.uid())
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);

-- Originals remain private; other users can play only approved free public/profile videos.
drop policy if exists video_originals_select_owner_admin_or_approved on storage.objects;
drop policy if exists video_originals_select_owner_or_admin on storage.objects;
create policy video_originals_select_owner_admin_or_approved
on storage.objects for select to authenticated
using (
  bucket_id = 'video-originals'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or exists (
      select 1 from public.videos v
      where v.storage_path = name
        and v.status = 'approved'
        and v.is_paid = false
        and v.visibility in ('public','profile')
    )
  )
);
