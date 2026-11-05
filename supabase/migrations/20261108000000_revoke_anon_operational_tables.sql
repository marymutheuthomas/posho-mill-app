-- Remove anonymous (not signed-in) access to every operational table.
--
-- A live probe on 2026-11-03 with the public anon key (which ships inside the app) could read
-- sales_transactions (273 rows, with customer names and phones), repayments, debt_book,
-- stock_take_history, production_logs, milling_sessions and purchases. 20261103 covers the
-- first three but had not taken effect; this one does not depend on it.
--
-- The app reads these tables only while signed in. Kept readable: products, because the
-- startup health check (DatabaseHealth.tsx) pings it before login; it holds names and prices.
--
-- Revoking table privileges blocks anon regardless of any RLS policy. Signed-in users
-- (role "authenticated") are not touched. Tables that do not exist are skipped. Safe to re-run.

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sales_transactions', 'repayments', 'debt_book', 'customers', 'customer_opening_balances',
    'milling_sessions', 'production_logs', 'purchases', 'stock_take_history', 'inventory_ledger',
    'profiles', 'audit_exceptions', 'daily_audits', 'expenses', 'stock_transfers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
      raise notice 'anon access removed: %', t;
    else
      raise notice 'skipped (no such table): %', t;
    end if;
  end loop;
end $$;

commit;

-- Verify (expect false everywhere except products):
--   select c.relname, has_table_privilege('anon', c.oid, 'select') as anon_can_read
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1;
