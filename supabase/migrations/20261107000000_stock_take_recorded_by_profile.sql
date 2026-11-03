-- Tie every stock take to the operator who made it.
--
-- Until now the app saved stock_take_history.recorded_by as a role label ("ADMIN" /
-- "EMPLOYEE"). The app now stamps the operator's profile id, like sales. This migration:
--   1. keeps the old labels in recorded_by_legacy (nothing is thrown away),
--   2. converts recorded_by to uuid (labels become null),
--   3. clears ids that match no profile, then adds a foreign key to profiles.
--
-- Deploy the app change first, then run this. Safe to re-run. If it stops with
-- "cannot alter type of a column used by a view or rule", a view selects
-- stock_take_history.recorded_by: drop and recreate that view around this migration.

begin;

alter table public.stock_take_history add column if not exists recorded_by_legacy text;

do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'stock_take_history' and column_name = 'recorded_by';

  if col_type is distinct from 'uuid' then
    update public.stock_take_history
       set recorded_by_legacy = recorded_by
     where recorded_by is not null
       and recorded_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and recorded_by_legacy is null;

    alter table public.stock_take_history
      alter column recorded_by type uuid
      using (case
               when recorded_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then recorded_by::uuid
             end);
    raise notice 'stock_take_history.recorded_by converted from % to uuid; role labels kept in recorded_by_legacy.', col_type;
  end if;
end $$;

-- An id with no profile would block the foreign key; keep it in the legacy column instead
update public.stock_take_history s
   set recorded_by_legacy = coalesce(s.recorded_by_legacy, s.recorded_by::text),
       recorded_by = null
 where s.recorded_by is not null
   and not exists (select 1 from public.profiles p where p.id = s.recorded_by);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_take_history_recorded_by_fkey') then
    alter table public.stock_take_history
      add constraint stock_take_history_recorded_by_fkey
      foreign key (recorded_by) references public.profiles(id) on delete set null;
  end if;
end $$;

commit;

-- Verify:
--   select data_type from information_schema.columns
--    where table_name = 'stock_take_history' and column_name = 'recorded_by';   -- uuid
--   select recorded_by_legacy, count(*) from public.stock_take_history group by 1;
