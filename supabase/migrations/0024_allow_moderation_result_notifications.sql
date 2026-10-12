alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array[
    'follow'::text,
    'follow_request'::text,
    'message'::text,
    'video_approved'::text,
    'video_rejected'::text,
    'moderation_result'::text,
    'room_invite'::text,
    'system'::text,
    'purchase'::text
  ]));
