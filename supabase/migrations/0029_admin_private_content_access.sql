-- Admin-only private media review, audited viewing, and deletion.
create table if not exists public.admin_private_content_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (action in ('list_private','view_private','delete_private')),
  content_type text check (content_type in ('video','photo')),
  content_id uuid,
  created_at timestamptz not null default now()
);
alter table public.admin_private_content_audit enable row level security;
revoke all on public.admin_private_content_audit from public, anon, authenticated;

create or replace function public.admin_private_content_list()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare result jsonb;
begin
  if not (coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false)
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'xlive18.official@gmail.com') then
    raise exception 'admin_required';
  end if;
  insert into public.admin_private_content_audit(actor_id, action) values (auth.uid(), 'list_private');
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object('type','video','id',v.id,'owner_id',v.owner_id,'username',p.username,
      'title',v.title,'description',v.description,'storage_path',v.storage_path,'preview_path',v.preview_path,
      'status',v.status,'visibility',v.visibility,'created_at',v.created_at) item, v.created_at
    from public.videos v left join public.profiles p on p.id=v.owner_id where v.visibility='private'
    union all
    select jsonb_build_object('type','photo','id',ph.id,'owner_id',ph.owner_id,'username',p.username,
      'title',ph.title,'description',ph.description,'storage_path',ph.storage_path,
      'status',ph.status,'visibility',ph.visibility,'created_at',ph.created_at) item, ph.created_at
    from public.photos ph left join public.profiles p on p.id=ph.owner_id where ph.visibility='private'
  ) private_items;
  return result;
end; $$;

create or replace function public.admin_log_private_content_access(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare is_private boolean := false;
begin
  if not (coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false)
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'xlive18.official@gmail.com') then
    raise exception 'admin_required';
  end if;
  if p_type='video' then
    select exists(select 1 from public.videos where id=p_id and visibility='private') into is_private;
  elsif p_type='photo' then
    select exists(select 1 from public.photos where id=p_id and visibility='private') into is_private;
  else raise exception 'invalid_content_type'; end if;
  if not is_private then raise exception 'private_content_not_found'; end if;
  insert into public.admin_private_content_audit(actor_id,action,content_type,content_id)
    values(auth.uid(),'view_private',p_type,p_id);
end; $$;

create or replace function public.admin_delete_private_content(p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth, storage as $$
declare file_path text; preview text; was_private boolean := false;
begin
  if not (coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false)
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'xlive18.official@gmail.com') then
    raise exception 'admin_required';
  end if;
  if p_type='video' then
    select storage_path,preview_path,(visibility='private') into file_path,preview,was_private
      from public.videos where id=p_id for update;
    if file_path is null or not coalesce(was_private,false) then raise exception 'private_content_not_found'; end if;
    insert into public.admin_private_content_audit(actor_id,action,content_type,content_id)
      values(auth.uid(),'delete_private','video',p_id);
    delete from storage.objects where bucket_id='video-originals' and name in(file_path,preview);
    delete from public.videos where id=p_id;
  elsif p_type='photo' then
    select storage_path,(visibility='private') into file_path,was_private from public.photos where id=p_id for update;
    if file_path is null or not coalesce(was_private,false) then raise exception 'private_content_not_found'; end if;
    insert into public.admin_private_content_audit(actor_id,action,content_type,content_id)
      values(auth.uid(),'delete_private','photo',p_id);
    delete from storage.objects where bucket_id='photo-originals' and name=file_path;
    delete from public.photos where id=p_id;
  else raise exception 'invalid_content_type'; end if;
  return jsonb_build_object('success',true);
end; $$;

revoke all on function public.admin_private_content_list() from public, anon;
revoke all on function public.admin_log_private_content_access(text,uuid) from public, anon;
revoke all on function public.admin_delete_private_content(text,uuid) from public, anon;
grant execute on function public.admin_private_content_list() to authenticated;
grant execute on function public.admin_log_private_content_access(text,uuid) to authenticated;
grant execute on function public.admin_delete_private_content(text,uuid) to authenticated;

drop policy if exists "Manager can view private videos" on storage.objects;
create policy "Manager can view private videos" on storage.objects for select to authenticated
using (bucket_id='video-originals' and (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role'='admin',false)
  or lower(coalesce(auth.jwt() ->> 'email',''))='xlive18.official@gmail.com'
));
drop policy if exists "Manager can view private photos" on storage.objects;
create policy "Manager can view private photos" on storage.objects for select to authenticated
using (bucket_id='photo-originals' and (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role'='admin',false)
  or lower(coalesce(auth.jwt() ->> 'email',''))='xlive18.official@gmail.com'
));
