-- Ensure authenticated creators can upload videos to the private originals bucket.
-- Keep the bucket private and constrain uploads to each user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-originals',
  'video-originals',
  false,
  52428800,
  array['video/mp4','video/webm','video/quicktime']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "video_originals_insert_owner_folder" on storage.objects;
create policy "video_originals_insert_owner_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'video-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
