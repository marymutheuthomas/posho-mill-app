-- Live verification for migrations 20261102 – 20261108 (NOT a migration).
--
-- Paste the WHOLE file into the Supabase SQL editor and run it once. The last statement prints
-- one row per check with PASS / FAIL / INFO. It simulates a staff login and an admin login
-- (the first EMPLOYEE and first ADMIN profile), inserts one test exception and deletes it
-- again at the end. Nothing else is changed.
--
-- If the "role simulation" row says FAIL, the editor ran each statement separately and the
-- staff/admin rows below it are not meaningful; run those checks from the app instead.

create temp table if not exists _verify (n serial, area text, check_name text, result text, detail text);
truncate _verify;
grant select, insert on _verify to authenticated, anon;
grant usage on sequence _verify_n_seq to authenticated, anon;

select set_config('verify.admin', coalesce((select id::text from public.profiles where role = 'ADMIN' order by created_at limit 1), ''), false),
       set_config('verify.staff', coalesce((select id::text from public.profiles where role <> 'ADMIN' order by created_at limit 1), ''), false);

delete from public.audit_exceptions where description like 'VERIFY TEST%';

-- 1. Schema from the migrations ---------------------------------------------------------------
insert into _verify (area, check_name, result, detail)
select 'schema', 'profiles.display_password removed (20261102)',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_password') then 'FAIL' else 'PASS' end, ''
union all
select 'schema', 'customers + customer_balances exist (20261104)',
       case when to_regclass('public.customers') is not null and to_regclass('public.customer_balances') is not null then 'PASS' else 'FAIL' end, ''
union all
select 'schema', 'audit_exceptions has RLS on (20261105)',
       case when (select relrowsecurity from pg_class where oid = to_regclass('public.audit_exceptions')) then 'PASS' else 'FAIL' end, ''
union all
select 'schema', 'approve-lock trigger present (20261106)',
       case when exists (select 1 from pg_trigger where tgname = 'trg_lock_approved_audit_exceptions') then 'PASS' else 'FAIL' end, ''
union all
select 'schema', 'stock_take_history.recorded_by is uuid (20261107)',
       case when (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'stock_take_history' and column_name = 'recorded_by') = 'uuid' then 'PASS' else 'FAIL' end,
       coalesce((select data_type from information_schema.columns where table_schema = 'public' and table_name = 'stock_take_history' and column_name = 'recorded_by'), 'column missing');

-- 2. Anonymous access (20261103 + 20261108): only products may be readable -------------------
insert into _verify (area, check_name, result, detail)
select 'rls', 'anon cannot read ' || c.relname,
       case when has_table_privilege('anon', c.oid, 'select') then 'FAIL' else 'PASS' end, ''
from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
where ns.nspname = 'public' and c.relkind in ('r', 'v') and c.relname <> 'products'
  and c.relname in ('sales_transactions','repayments','debt_book','customers','customer_balances','customer_opening_balances',
                    'milling_sessions','production_logs','purchases','stock_take_history','inventory_ledger','profiles','audit_exceptions');

-- 3. Customer balances are derived from the ledger -------------------------------------------
insert into _verify (area, check_name, result, detail)
select 'crm', 'customer_balances = opening + credit sales - repayments',
       case when count(*) filter (where abs(b.balance - (coalesce(o.amt,0) + coalesce(s.amt,0) - coalesce(r.amt,0))) > 0.01) = 0 then 'PASS' else 'FAIL' end,
       count(*) || ' customers checked'
from public.customer_balances b
left join (select customer_id, sum(amount) amt from public.customer_opening_balances group by 1) o on o.customer_id = b.customer_id
left join (select customer_id, sum(amount_debt) amt from public.sales_transactions where customer_id is not null group by 1) s on s.customer_id = b.customer_id
left join (select customer_id, sum(amount) amt from public.repayments where customer_id is not null group by 1) r on r.customer_id = b.customer_id;

-- 4. Figures to compare with the Dashboard (Nairobi days) -------------------------------------
insert into _verify (area, check_name, result, detail)
select 'dashboard', 'Today: ' || p.label, 'INFO',
       'retail inflow KSh ' || coalesce(sum(st.amount_cash + st.amount_mpesa) filter (where st.transaction_type = 'Product'), 0)
       || ' | milling fees KSh ' || coalesce(sum(st.total_price) filter (where st.transaction_type = 'Service'), 0)
       || ' | milling kg ' || coalesce(sum(st.weight_kg) filter (where st.transaction_type = 'Service'), 0)
from (values ('today', date_trunc('day', now() at time zone 'Africa/Nairobi')),
             ('this week (Mon-)', date_trunc('week', now() at time zone 'Africa/Nairobi'))) as p(label, start_local)
left join public.sales_transactions st on (st.created_at at time zone 'Africa/Nairobi') >= p.start_local
group by p.label;
update _verify set check_name = replace(check_name, 'Today: this week', 'This week') where check_name like 'Today: this week%';

-- 5. No-shift sales and production saved --------------------------------------------------------
insert into _verify (area, check_name, result, detail)
select 'no-shift', 'sales saved without a shift (last 7 days)', 'INFO', count(*)::text
from public.sales_transactions where session_id is null and created_at > now() - interval '7 days'
union all
select 'no-shift', 'production logs saved without a shift (last 7 days)', 'INFO', count(*)::text
from public.production_logs where session_id is null and created_at > now() - interval '7 days';

-- 6. Stock-take accountability -------------------------------------------------------------------
insert into _verify (area, check_name, result, detail)
select 'stock-take', 'stock takes in last 7 days tied to a profile',
       case when count(*) = 0 then 'INFO' when count(*) filter (where recorded_by is null) = 0 then 'PASS' else 'FAIL' end,
       count(*) filter (where recorded_by is not null) || ' of ' || count(*) || ' have an operator id'
from public.stock_take_history where created_at > now() - interval '7 days';

-- 7. Staff and admin behaviour on audit_exceptions (simulated logins) ----------------------------
-- 7a. as staff
select set_config('request.jwt.claims', json_build_object('sub', current_setting('verify.staff'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _verify (area, check_name, result, detail)
select 'audit', 'role simulation works', case when current_user = 'authenticated' then 'PASS' else 'FAIL' end, 'current_user = ' || current_user;
insert into public.audit_exceptions (exception_type, description, severity, recorded_by)
values ('INVENTORY_DRIFT', 'VERIFY TEST - deleted at the end of verify_live.sql', 'WARNING', nullif(current_setting('verify.staff'), '')::uuid);
insert into _verify (area, check_name, result, detail)
select 'audit', 'staff sees their own pending exception', case when count(*) = 1 then 'PASS' else 'FAIL' end, count(*) || ' visible'
from public.audit_exceptions where description like 'VERIFY TEST%';
with u as (update public.audit_exceptions set status = 'APPROVED', approved_by = nullif(current_setting('verify.staff'), '')::uuid, approved_at = now()
           where description like 'VERIFY TEST%' returning 1)
insert into _verify (area, check_name, result, detail)
select 'audit', 'staff cannot approve', case when count(*) = 0 then 'PASS' else 'FAIL' end, count(*) || ' rows changed' from u;
reset role;

-- 7b. as admin
select set_config('request.jwt.claims', json_build_object('sub', current_setting('verify.admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
with u as (update public.audit_exceptions set status = 'APPROVED', approved_by = nullif(current_setting('verify.admin'), '')::uuid, approved_at = now()
           where description like 'VERIFY TEST%' and status = 'PENDING_ADMIN_APPROVAL' returning 1)
insert into _verify (area, check_name, result, detail)
select 'audit', 'admin can Approve & Lock', case when count(*) = 1 then 'PASS' else 'FAIL' end, count(*) || ' rows approved' from u;
do $$
begin
  update public.audit_exceptions set description = description || ' (edited)' where description like 'VERIFY TEST%';
  insert into _verify (area, check_name, result, detail) values ('audit', 'approved exception is locked', 'FAIL', 'edit was allowed');
exception when insufficient_privilege then
  insert into _verify (area, check_name, result, detail) values ('audit', 'approved exception is locked', 'PASS', sqlerrm);
end $$;
reset role;

-- Clean up the test row (delete is admin-only in the app; here we run as the database owner)
delete from public.audit_exceptions where description like 'VERIFY TEST%';

select area, check_name, result, detail from _verify order by n;
