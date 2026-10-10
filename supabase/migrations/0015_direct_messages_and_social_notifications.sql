-- Direct messages are available only between users with an existing follow connection.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_no_self check (sender_id <> recipient_id)
);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_created_idx on public.messages (recipient_id, created_at desc);
create index if not exists messages_unread_recipient_idx on public.messages (recipient_id, created_at desc) where read_at is null;
alter table public.messages enable row level security;

drop policy if exists "messages_select_participant_unblocked" on public.messages;
create policy "messages_select_participant_unblocked" on public.messages
for select to authenticated
using (
  (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  and not private.is_blocked_pair(sender_id, recipient_id)
);

drop policy if exists "messages_insert_sender_connected" on public.messages;
create policy "messages_insert_sender_connected" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and sender_id <> recipient_id
  and not private.is_blocked_pair(sender_id, recipient_id)
  and exists (
    select 1 from public.follows f
    where (f.follower_id = sender_id and f.followed_id = recipient_id)
       or (f.follower_id = recipient_id and f.followed_id = sender_id)
  )
);

drop policy if exists "messages_update_recipient_read" on public.messages;
create policy "messages_update_recipient_read" on public.messages
for update to authenticated
using (recipient_id = (select auth.uid()) and not private.is_blocked_pair(sender_id, recipient_id))
with check (recipient_id = (select auth.uid()) and not private.is_blocked_pair(sender_id, recipient_id));

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind in ('follow','follow_request','message','video_approved','video_rejected','room_invite','system','purchase'));

create or replace function private.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, title, body, target_type, target_id)
  values (new.recipient_id, new.sender_id, 'message', 'رسالة جديدة', left(new.body, 180), 'message', new.id);
  return new;
end;
$$;
revoke all on function private.notify_message() from public, anon, authenticated;
drop trigger if exists messages_notify_recipient on public.messages;
create trigger messages_notify_recipient after insert on public.messages
for each row execute function private.notify_message();

create or replace function private.notify_follow_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, title, body, target_type, target_id)
  values (new.followed_id, new.follower_id, 'follow', 'متابع جديد', 'بدأ حساب بمتابعتك.', 'profile', new.follower_id);
  return new;
end;
$$;
revoke all on function private.notify_follow_event() from public, anon, authenticated;
drop trigger if exists follows_notify_recipient on public.follows;
create trigger follows_notify_recipient after insert on public.follows
for each row execute function private.notify_follow_event();

create or replace function private.notify_follow_request_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, kind, title, body, target_type, target_id)
    values (new.target_id, new.requester_id, 'follow_request', 'طلب متابعة جديد', 'لديك طلب متابعة جديد.', 'profile', new.requester_id);
  elsif new.status is distinct from old.status and new.status in ('accepted','rejected') then
    insert into public.notifications (recipient_id, actor_id, kind, title, body, target_type, target_id)
    values (
      new.requester_id, new.target_id, 'follow_request',
      case when new.status = 'accepted' then 'تم قبول طلب المتابعة' else 'تم رفض طلب المتابعة' end,
      case when new.status = 'accepted' then 'وافق الحساب على طلب متابعتك.' else 'لم تتم الموافقة على طلب المتابعة.' end,
      'profile', new.target_id
    );
  end if;
  return new;
end;
$$;
revoke all on function private.notify_follow_request_event() from public, anon, authenticated;
drop trigger if exists follow_requests_notify_participants on public.follow_requests;
create trigger follow_requests_notify_participants
after insert or update of status on public.follow_requests
for each row execute function private.notify_follow_request_event();
