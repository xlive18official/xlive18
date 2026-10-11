-- Publicly readable published homepage design; only app-metadata admins may change it.
begin;

create table if not exists public.site_page_designs (
  page_key text primary key check (page_key = 'home'),
  design jsonb not null default '{}'::jsonb,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.site_page_designs enable row level security;

drop policy if exists "site_page_designs_public_read" on public.site_page_designs;
create policy "site_page_designs_public_read"
on public.site_page_designs for select to anon, authenticated
using (true);

drop policy if exists "site_page_designs_admin_insert" on public.site_page_designs;
create policy "site_page_designs_admin_insert"
on public.site_page_designs for insert to authenticated
with check (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
  and updated_by = (select auth.uid())
);

drop policy if exists "site_page_designs_admin_update" on public.site_page_designs;
create policy "site_page_designs_admin_update"
on public.site_page_designs for update to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false))
with check (
  coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
  and updated_by = (select auth.uid())
);

revoke all privileges on table public.site_page_designs from anon, authenticated;
grant select on table public.site_page_designs to anon, authenticated;
grant insert (page_key, design, updated_by) on table public.site_page_designs to authenticated;
grant update (page_key, design, updated_by) on table public.site_page_designs to authenticated;

create or replace function public.set_site_page_design_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_page_designs_updated_at on public.site_page_designs;
create trigger site_page_designs_updated_at
before update on public.site_page_designs
for each row execute function public.set_site_page_design_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-design-assets',
  'site-design-assets',
  true,
  8388608,
  array['image/png','image/jpeg','image/webp','image/svg+xml']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site_design_assets_admin_insert" on storage.objects;
create policy "site_design_assets_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'site-design-assets'
  and (storage.foldername(name))[1] = 'home'
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);

drop policy if exists "site_design_assets_admin_update" on storage.objects;
create policy "site_design_assets_admin_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'site-design-assets'
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
)
with check (
  bucket_id = 'site-design-assets'
  and (storage.foldername(name))[1] = 'home'
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);

drop policy if exists "site_design_assets_admin_delete" on storage.objects;
create policy "site_design_assets_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'site-design-assets'
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
);

commit;
