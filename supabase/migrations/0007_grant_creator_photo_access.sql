-- Explicit table privileges for creator photo upload/read under RLS.
begin;
grant select, insert on public.photos to authenticated;
commit;
