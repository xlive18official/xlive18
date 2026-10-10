-- Cover foreign-key columns used for joins, deletes, and moderation queries.
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists purchases_video_id_idx on public.purchases (video_id);
create index if not exists reports_moderator_id_idx on public.reports (moderator_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists room_members_user_id_idx on public.room_members (user_id);
create index if not exists rooms_host_id_idx on public.rooms (host_id);
create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);
create index if not exists videos_reviewed_by_idx on public.videos (reviewed_by);
