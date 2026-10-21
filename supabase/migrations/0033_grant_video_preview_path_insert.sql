-- Allow authenticated creators to save the preview image path for their own uploaded video.
-- The videos_insert_pending_self RLS policy still requires owner_id = auth.uid() and status = pending.
-- The table constraint ensures preview_path remains inside the owner's folder.
revoke insert on public.videos from authenticated;
grant insert (owner_id, title, description, storage_path, preview_path, status, visibility, is_paid)
  on public.videos to authenticated;
