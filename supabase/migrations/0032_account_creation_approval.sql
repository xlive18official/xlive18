-- Require administrator approval before newly registered accounts can enter the site.
begin;

alter table public.profiles
  add column if not exists account_status text not null default 'pending'
  check (account_status in ('pending','approved','rejected'));

-- Existing accounts are grandfathered in; only newly created profiles wait for review.
update public.profiles set account_status = 'approved' where account_status = 'pending'
  and created_at < now() - interval '1 minute';

create index if not exists profiles_account_status_idx
  on public.profiles (account_status, created_at desc);

create or replace function public.admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare result jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) is not true
     and lower(coalesce(auth.jwt() ->> 'email','')) <> 'xlive18.official@gmail.com' then
    raise exception 'admin_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'username', p.username,
    'display_name', p.display_name,
    'created_at', u.created_at,
    'banned', b.user_id is not null,
    'phone_number', u.raw_user_meta_data ->> 'phone_number',
    'account_status', coalesce(p.account_status, 'pending')
  ) order by u.created_at desc), '[]'::jsonb)
  into result
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.account_bans b on b.user_id = u.id;
  return result;
end
$function$;

create or replace function public.admin_set_account_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) is not true
     and lower(coalesce(auth.jwt() ->> 'email','')) <> 'xlive18.official@gmail.com' then
    raise exception 'admin_required';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'invalid_account_status';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_review_own_account';
  end if;
  update public.profiles
    set account_status = p_status, updated_at = now()
    where id = p_user_id;
  if not found then raise exception 'profile_not_found'; end if;
end
$function$;

revoke all on function public.admin_set_account_status(uuid,text) from public, anon;
grant execute on function public.admin_set_account_status(uuid,text) to authenticated;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

commit;
