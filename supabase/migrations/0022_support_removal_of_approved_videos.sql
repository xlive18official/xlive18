create or replace function private.validate_video_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','removed') then
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'Video review must include reviewer and timestamp';
    end if;
    if new.status in ('rejected','removed') and coalesce(char_length(trim(new.rejection_reason)),0) < 3 then
      raise exception 'Rejected or removed videos require a reason';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_video_review() from public, anon, authenticated;

create or replace function private.notify_video_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','removed') then
    insert into public.notifications (recipient_id, actor_id, kind, title, body, target_type, target_id)
    values (
      new.owner_id, new.reviewed_by,
      case when new.status = 'approved' then 'video_approved' else 'video_rejected' end,
      case when new.status = 'approved' then 'تمت الموافقة على الفيديو' when new.status = 'removed' then 'تمت إزالة الفيديو' else 'تم رفض الفيديو' end,
      case when new.status = 'approved' then 'أصبح الفيديو متاحاً وفق إعدادات النشر.' else coalesce(new.rejection_reason, 'يرجى مراجعة إرشادات النشر.') end,
      'video', new.id
    );
  end if;
  return new;
end;
$$;
revoke all on function private.notify_video_review() from public, anon, authenticated;
