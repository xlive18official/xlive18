-- Support a dimmed private-video preview without granting access to the video file.
update storage.buckets
set allowed_mime_types = array['video/mp4','video/webm','video/quicktime','image/jpeg']::text[]
where id = 'video-originals';

drop policy if exists video_originals_select_owner_admin_or_approved on storage.objects;
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
    or exists (
      select 1 from public.videos v
      where v.preview_path = name
        and v.status = 'approved'
        and v.is_paid = false
        and v.visibility in ('public','profile','private')
    )
  )
);
