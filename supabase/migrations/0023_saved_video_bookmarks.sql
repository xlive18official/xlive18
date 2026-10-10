create table if not exists public.saved_videos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists saved_videos_user_created_idx on public.saved_videos (user_id, created_at desc);
alter table public.saved_videos enable row level security;

drop policy if exists "saved_videos_select_self" on public.saved_videos;
create policy "saved_videos_select_self" on public.saved_videos
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "saved_videos_insert_self_public_video" on public.saved_videos;
create policy "saved_videos_insert_self_public_video" on public.saved_videos
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.videos v
    where v.id = video_id
      and v.status = 'approved'
      and v.is_paid = false
      and v.visibility = 'public'
  )
);

drop policy if exists "saved_videos_delete_self" on public.saved_videos;
create policy "saved_videos_delete_self" on public.saved_videos
for delete to authenticated using (user_id = (select auth.uid()));

revoke all privileges on table public.saved_videos from anon, authenticated;
grant select, delete on public.saved_videos to authenticated;
grant insert (user_id, video_id) on public.saved_videos to authenticated;
