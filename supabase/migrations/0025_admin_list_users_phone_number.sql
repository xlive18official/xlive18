-- Add the registration phone number to the admin-only account listing.
-- The number is user-provided and is NOT proof of ownership until SMS verification is added.
create or replace function public.admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  result jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) is not true then
    raise exception 'admin_required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'username', p.username,
        'display_name', p.display_name,
        'created_at', u.created_at,
        'banned', b.user_id is not null,
        'phone_number', u.raw_user_meta_data ->> 'phone_number'
      )
      order by u.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.account_bans b on b.user_id = u.id;

  return result;
end
$function$;
