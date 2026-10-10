-- Remove permissive default table grants and grant only the operations used by the app.
revoke all privileges on table public.profiles, public.user_blocks, public.follows, public.videos,
  public.rooms, public.room_members, public.reports, public.notifications, public.purchases,
  public.follow_requests, public.messages from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (display_name, bio, is_private) on public.profiles to authenticated;

grant select, insert, delete on public.user_blocks to authenticated;
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

grant select on public.videos to anon, authenticated;
grant insert on public.videos to authenticated;
grant update (title, description, visibility, status, reviewed_by, reviewed_at, rejection_reason) on public.videos to authenticated;

grant select on public.rooms to anon, authenticated;
grant insert on public.rooms to authenticated;
grant update (title, description, media_mode, visibility, status, capacity) on public.rooms to authenticated;

grant select on public.room_members to authenticated;

grant select, insert on public.reports to authenticated;
grant update (status, moderator_id, moderator_note, resolved_at) on public.reports to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select on public.purchases to authenticated;

grant select, insert, delete on public.follow_requests to authenticated;
grant update (status) on public.follow_requests to authenticated;

grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- Storage clients may read eligible objects, upload into their own folder, and clean up
-- unapproved/orphaned uploads; RLS policies remain the authoritative object-level guard.
revoke all privileges on table storage.objects from anon, authenticated;
grant select on table storage.objects to anon, authenticated;
grant insert, delete on table storage.objects to authenticated;
