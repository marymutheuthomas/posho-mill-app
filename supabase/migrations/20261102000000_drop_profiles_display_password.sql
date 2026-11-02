-- Remove plain-text passwords from public.profiles.
--
-- profiles.display_password held each user's real password, written by the admin
-- "create user" form and readable by every admin browser. Supabase Auth already
-- stores a proper hash in auth.users; nothing needs this copy.
--
-- ORDER MATTERS: deploy the app build that no longer reads or writes this column
-- first. Older builds send display_password on user creation and would fail.
--
-- Pre-check (should return no rows; if it does, update those views/functions first):
--   select distinct dependent_view.relname
--   from pg_depend d
--   join pg_rewrite r on r.oid = d.objid
--   join pg_class dependent_view on dependent_view.oid = r.ev_class
--   join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
--   where d.refobjid = 'public.profiles'::regclass and a.attname = 'display_password';
--
--   select proname from pg_proc where prosrc ilike '%display_password%';

alter table public.profiles drop column if exists display_password;
