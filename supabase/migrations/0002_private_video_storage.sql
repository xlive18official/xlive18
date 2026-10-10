-- Private video storage for XLive 18.
-- Keep original video objects private; never use a public bucket for paid media.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-originals',
  'video-originals',
  false,
  52428800,
  array['video/mp4','video/webm','video/quicktime']::text[]
)
on conflict (id) do nothing;

drop policy if exists "video_originals_select_owner_or_admin" on storage.objects;
create policy "video_originals_select_owner_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'video-originals'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
  )
);

drop policy if exists "video_originals_insert_owner_folder" on storage.objects;
create policy "video_originals_insert_owner_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'video-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Deliberately no client UPDATE or DELETE policy: use a trusted moderation workflow.
commit;
