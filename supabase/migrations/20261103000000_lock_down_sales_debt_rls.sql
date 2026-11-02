-- Close public and over-broad access to sales, repayments and customer debts.
--
-- Postgres combines permissive RLS policies with OR, so one blanket "true" policy
-- overrides every careful one. Before this migration:
--   * anon (no login, public key)  could read all sales (names, phones) and
--     read/insert/update/DELETE every repayment; debt_book was readable too.
--   * any signed-in user could update/delete any sale (via "Allow all for
--     authenticated users"), edit any customer balance and change repayment amounts,
--     despite the stricter "admins only" policies.
--
-- After it (matches what the app UI already allows):
--   sales_transactions  read/insert: signed-in users;  update: admins, or the
--                       recorder within 12h while the session is open;  delete: admins
--   repayments          read/insert: signed-in users;  update/delete: admins
--   debt_book           read/insert: signed-in users;  update/delete: admins
--   anon                no access to any of the three
--
-- Safe to re-run. Run in the Supabase SQL editor; read the NOTICE output.

begin;

-- 1. Make sure RLS is actually on (anon could read debt_book, so it may be off).
alter table public.sales_transactions enable row level security;
alter table public.repayments         enable row level security;
alter table public.debt_book          enable row level security;

-- 2. No anonymous access at all. The app only touches these tables while signed in.
--    (Also covers get_user_role() returning 'ADMIN' for anonymous callers.)
revoke all on table public.sales_transactions, public.repayments, public.debt_book from anon;

drop policy if exists "Public Repayments Access" on public.repayments;
drop policy if exists "Allow Public Read"        on public.sales_transactions;

-- 3. Remove blanket policies that override the restricted ones.
drop policy if exists "Allow all for authenticated users"      on public.sales_transactions; -- ALL, true
drop policy if exists "Allow authenticated update"             on public.sales_transactions; -- any edit
drop policy if exists "Employees can update sales_transactions" on public.sales_transactions; -- any edit
drop policy if exists "Employees can update repayments"        on public.repayments;         -- change amounts

-- 4. debt_book updates: only drop the blanket policy if no trigger on sales/repayments
--    updates debt_book as the calling user; otherwise credit sales would start failing.
do $$
declare
  invoker_writers text;
begin
  select string_agg(distinct p.proname, ', ')
    into invoker_writers
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
    and t.tgrelid in ('public.sales_transactions'::regclass, 'public.repayments'::regclass)
    and not p.prosecdef
    and pg_get_functiondef(p.oid) ilike '%debt_book%';

  if invoker_writers is null then
    drop policy if exists "Allow authenticated update" on public.debt_book;
    raise notice 'debt_book: blanket update policy removed; only admins can edit customer balances.';
  else
    raise notice 'debt_book: KEPT "Allow authenticated update" because trigger function(s) % write debt_book as the calling user. Make them SECURITY DEFINER, then re-run this migration.', invoker_writers;
  end if;
end $$;

commit;

-- Verify (expect: no anon rows; only the intended policies left):
--   select tablename, policyname, cmd, roles from pg_policies
--   where tablename in ('sales_transactions','repayments','debt_book') order by 1, 2;
--   select relname, relrowsecurity from pg_class
--   where relname in ('sales_transactions','repayments','debt_book');
