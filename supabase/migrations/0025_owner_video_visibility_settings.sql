create or replace function public.set_own_video_visibility(p_video_id uuid, p_visibility text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول لتعديل خصوصية المقطع.';
  end if;

  if p_visibility not in ('public', 'private', 'profile') then
    raise exception 'خيار الخصوصية غير صالح.';
  end if;

  update public.videos
     set visibility = p_visibility
   where id = p_video_id
     and owner_id = auth.uid();

  if not found then
    raise exception 'المقطع غير موجود أو لا تملك صلاحية تعديله.';
  end if;
end;
$$;

revoke all on function public.set_own_video_visibility(uuid, text) from public, anon;
grant execute on function public.set_own_video_visibility(uuid, text) to authenticated;
