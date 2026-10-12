-- Use Supabase Storage API for file deletion; SQL may only delete metadata rows.
create or replace function public.admin_delete_content(p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
 if not (coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) or lower(coalesce(auth.jwt() ->> 'email',''))='xlive18.official@gmail.com') then raise exception 'admin_required'; end if;
 if p_type='video' then
   if not exists(select 1 from public.videos where id=p_id) then raise exception 'content_not_found'; end if;
   delete from public.videos where id=p_id;
 elsif p_type='photo' then
   if not exists(select 1 from public.photos where id=p_id) then raise exception 'content_not_found'; end if;
   delete from public.photos where id=p_id;
 else raise exception 'invalid_content_type'; end if;
 return jsonb_build_object('success',true);
end; $$;

create or replace function public.admin_delete_private_content(p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare was_private boolean := false;
begin
 if not (coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) or lower(coalesce(auth.jwt() ->> 'email',''))='xlive18.official@gmail.com') then raise exception 'admin_required'; end if;
 if p_type='video' then
   select (visibility='private') into was_private from public.videos where id=p_id for update;
   if not coalesce(was_private,false) then raise exception 'private_content_not_found'; end if;
   insert into public.admin_private_content_audit(actor_id,action,content_type,content_id) values(auth.uid(),'delete_private','video',p_id);
   delete from public.videos where id=p_id;
 elsif p_type='photo' then
   select (visibility='private') into was_private from public.photos where id=p_id for update;
   if not coalesce(was_private,false) then raise exception 'private_content_not_found'; end if;
   insert into public.admin_private_content_audit(actor_id,action,content_type,content_id) values(auth.uid(),'delete_private','photo',p_id);
   delete from public.photos where id=p_id;
 else raise exception 'invalid_content_type'; end if;
 return jsonb_build_object('success',true);
end; $$;

revoke all on function public.admin_delete_content(text,uuid) from public, anon;
revoke all on function public.admin_delete_private_content(text,uuid) from public, anon;
grant execute on function public.admin_delete_content(text,uuid) to authenticated;
grant execute on function public.admin_delete_private_content(text,uuid) to authenticated;

drop policy if exists "Manager can delete video originals" on storage.objects;
create policy "Manager can delete video originals" on storage.objects for delete to authenticated using (bucket_id='video-originals' and (coalesce(auth.jwt() -> 'app_metadata' ->> 'role'='admin',false) or lower(coalesce(auth.jwt() ->> 'email',''))='xlive18.official@gmail.com'));
drop policy if exists "Manager can delete photo originals" on storage.objects;
create policy "Manager can delete photo originals" on storage.objects for delete to authenticated using (bucket_id='photo-originals' and (coalesce(auth.jwt() -> 'app_metadata' ->> 'role'='admin',false) or lower(coalesce(auth.jwt() ->> 'email',''))='xlive18.official@gmail.com'));