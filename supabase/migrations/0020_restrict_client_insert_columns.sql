-- Restrict INSERT columns so clients cannot set moderation fields, timestamps, or read receipts.
revoke insert on public.videos from authenticated;
grant insert (owner_id, title, description, storage_path, status, visibility, is_paid) on public.videos to authenticated;

revoke insert on public.rooms from authenticated;
grant insert (host_id, title, description, media_mode, visibility, status, capacity) on public.rooms to authenticated;

revoke insert on public.reports from authenticated;
grant insert (reporter_id, target_type, target_id, reason, details, status) on public.reports to authenticated;

revoke insert on public.messages from authenticated;
grant insert (sender_id, recipient_id, body) on public.messages to authenticated;

revoke insert on public.follow_requests from authenticated;
grant insert (requester_id, target_id, status) on public.follow_requests to authenticated;

revoke insert on public.follows from authenticated;
grant insert (follower_id, followed_id) on public.follows to authenticated;

revoke insert on public.user_blocks from authenticated;
grant insert (blocker_id, blocked_id) on public.user_blocks to authenticated;
