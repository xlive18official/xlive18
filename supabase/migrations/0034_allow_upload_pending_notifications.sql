-- Allow the admin notification created when a creator submits a video or photo for review.
-- The notification trigger uses kind = 'upload_pending'; without this value the upload transaction rolls back.
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array[
    'follow',
    'follow_request',
    'message',
    'video_approved',
    'video_rejected',
    'moderation_result',
    'room_invite',
    'system',
    'purchase',
    'upload_pending'
  ]::text[]));
