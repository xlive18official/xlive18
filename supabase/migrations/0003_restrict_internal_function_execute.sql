-- Restrict privileged helper functions from direct API execution.
-- handle_new_user is invoked by the auth.users trigger, not by client RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable is an event-trigger helper, not a client RPC.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- The block-pair helper is needed by the follows RLS policy, but should not
-- be exposed as a public RPC. Keep it in a non-exposed schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_blocked_pair(uuid, uuid) set schema private;
revoke all on function private.is_blocked_pair(uuid, uuid) from public, anon;
grant execute on function private.is_blocked_pair(uuid, uuid) to authenticated;
