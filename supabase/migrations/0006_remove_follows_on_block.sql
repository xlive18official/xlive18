-- A block immediately removes any existing follow relationship in either direction.
-- This prevents old follows from persisting after a user blocks or is blocked.
create or replace function public.remove_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followed_id = new.blocked_id)
     or (follower_id = new.blocked_id and followed_id = new.blocker_id);
  return new;
end;
$$;

revoke all on function public.remove_follows_on_block() from public, anon, authenticated;

drop trigger if exists user_blocks_remove_follows on public.user_blocks;
create trigger user_blocks_remove_follows
after insert on public.user_blocks
for each row execute function public.remove_follows_on_block();
