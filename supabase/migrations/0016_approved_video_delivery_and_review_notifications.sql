-- Publicly approved free videos may be streamed through authenticated/anonymous Storage reads.
-- Paid originals remain unavailable to other users; owners and admins retain review access.
drop policy if exists "video_originals_select_owner_or_admin" on storage.objects;
create policy "video_originals_select_owner_admin_or_approved"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'video-originals'
  and (
    (select auth.uid())::text = (storage.foldername(name))[1]
    or coalesce(((select auth.jwt())->'app_metadata'->>'role') = 'admin', false)
    or exists (
      select 1 from public.videos v
      where v.storage_path = storage.objects.name
        and v.status = 'approved'
        and v.is_paid = false
        and v.visibility = 'public'
    )
    or exists (
      select 1 from public.videos v
      where v.preview_path = storage.objects.name
        and v.status = 'approved'
        and v.visibility = 'public'
    )
  )
);

-- Permit cleanup of unreferenced failed uploads and removal of non-approved owner files.
drop policy if exists "video_originals_delete_unapproved_owner" on storage.objects;
create policy "video_originals_delete_unapproved_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'video-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.videos v
    where v.storage_path = storage.objects.name
      and v.status = 'approved'
  )
  and not exists (
    select 1 from public.videos v
    where v.preview_path = storage.objects.name
      and v.status = 'approved'
  )
);

create or replace function private.notify_video_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    insert into public.notifications (recipient_id, actor_id, kind, title, body, target_type, target_id)
    values (
      new.owner_id, new.reviewed_by,
      case when new.status = 'approved' then 'video_approved' else 'video_rejected' end,
      case when new.status = 'approved' then 'تمت الموافقة على الفيديو' else 'تم رفض الفيديو' end,
      case when new.status = 'approved' then 'أصبح الفيديو متاحاً وفق إعدادات النشر.' else coalesce(new.rejection_reason, 'يرجى مراجعة إرشادات النشر.') end,
      'video', new.id
    );
  end if;
  return new;
end;
$$;
revoke all on function private.notify_video_review() from public, anon, authenticated;
drop trigger if exists videos_notify_owner_review on public.videos;
create trigger videos_notify_owner_review after update of status on public.videos
for each row execute function private.notify_video_review();
