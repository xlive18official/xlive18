-- External video links are embedded from their source; no video file is copied to XLIVE18 storage.
create table if not exists public.external_video_links (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  source_url text not null check (source_url ~ '^https://'),
  embed_url text not null check (embed_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending','approved','removed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.external_video_links enable row level security;
revoke all on public.external_video_links from public;
grant select on public.external_video_links to anon, authenticated;
grant insert, update, delete on public.external_video_links to authenticated;
drop policy if exists "Public can view approved external video links" on public.external_video_links;
create policy "Public can view approved external video links"
on public.external_video_links for select to anon, authenticated using (status = 'approved');
drop policy if exists "Admins can manage external video links" on public.external_video_links;
create policy "Admins can manage external video links"
on public.external_video_links for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) or lower(coalesce(auth.jwt() ->> 'email', '')) = 'xlive18.official@gmail.com')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) or lower(coalesce(auth.jwt() ->> 'email', '')) = 'xlive18.official@gmail.com');
create index if not exists external_video_links_public_created_idx on public.external_video_links(status, created_at desc);
