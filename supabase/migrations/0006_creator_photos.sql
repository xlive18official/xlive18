-- Creator photo uploads for XLive 18.
-- Photos remain private in storage until the moderation workflow approves them.
begin;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 2000),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected','removed')),
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photo_storage_path_owner check (storage_path like owner_id::text || '/%')
);

create index if not exists photos_owner_idx on public.photos (owner_id, created_at desc);
create index if not exists photos_public_feed_idx on public.photos (created_at desc)
  where status = 'approved' and visibility = 'public';

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at before update on public.photos
for each row execute function public.set_updated_at();

alter table public.photos enable row level security;
drop policy if exists "photos_select_owner_or_approved_public" on public.photos;
create policy "photos_select_owner_or_approved_public"
on public.photos for select to authenticated
using (
  owner_id = (select auth.uid())
  or (status = 'approved' and visibility = 'public')
);
drop policy if exists "photos_insert_owner_pending" on public.photos;
create policy "photos_insert_owner_pending"
on public.photos for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and status = 'pending'
  and storage_path like (select auth.uid())::text || '/%'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photo-originals', 'photo-originals', false, 10485760, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[];

drop policy if exists "photo_originals_select_owner_or_approved_public" on storage.objects;
create policy "photo_originals_select_owner_or_approved_public"
on storage.objects for select to authenticated
using (
  bucket_id = 'photo-originals'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.photos p
      where p.storage_path = storage.objects.name
        and p.status = 'approved'
        and p.visibility = 'public'
    )
  )
);

drop policy if exists "photo_originals_insert_owner_folder" on storage.objects;
create policy "photo_originals_insert_owner_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'photo-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
