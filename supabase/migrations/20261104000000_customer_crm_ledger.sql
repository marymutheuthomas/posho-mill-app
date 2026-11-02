-- Customer CRM with ledger-backed balances.
--
-- Balance is never stored: it is derived from history.
--   balance = opening balance + credit sales (sales_transactions.amount_debt)
--             - repayments
--
-- What this does
--   1. customers table (name, phone, location, KRA PIN, credit limit).
--   2. Existing debt_book rows become customers WITH THE SAME id, so every existing
--      repayments.customer_id stays valid. Name-only debtors found in sales become
--      customers too.
--   3. sales_transactions.customer_id links each sale to a customer (backfilled by
--      exact name match, only where the name is unambiguous).
--   4. Each migrated customer's balance is carried over exactly:
--        opening = (debt_book.original_debt - amount_paid)
--                  - (linked credit sales - linked repayments)
--      so nobody's balance changes on migration day.
--   5. repayments gain method (Cash/M-Pesa/Bank), session_id (cash drawer),
--      recorded_by and effective_time; the customer FK moves to customers.
--   6. customer_balances view, RLS, and an admin-only credit-limit guard.
--
-- debt_book is left in place untouched (read-only history). The app stops using it.
--
-- RUN ORDER: run this BEFORE deploying the app build that uses customers.
-- Takes table locks briefly: run outside trading hours. Safe to re-run.

begin;

-- 0. Preconditions --------------------------------------------------------------
do $$
declare
  id_type text;
begin
  select data_type into id_type from information_schema.columns
  where table_schema = 'public' and table_name = 'repayments' and column_name = 'id';
  if id_type is distinct from 'uuid' then
    raise exception 'repayments.id is % (expected uuid). The app generates UUIDs on the device for offline sync; convert repayments.id to uuid first.', coalesce(id_type, 'missing');
  end if;
end $$;

-- 1. Customers -------------------------------------------------------------------
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  phone         text,
  location      text,
  kra_pin       text,
  credit_limit  numeric(12,2) not null default 0 check (credit_limit >= 0), -- 0 = no limit set
  notes         text,
  is_active     boolean not null default true,
  legacy_source text,  -- 'debt_book' | 'sales_name' for migrated rows
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_customers_name_key on public.customers (upper(trim(name)));
create index if not exists idx_customers_phone on public.customers (phone);

create table if not exists public.customer_opening_balances (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  amount         numeric(12,2) not null,           -- + owed by customer, - credit in their favour
  effective_time timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_opening_customer on public.customer_opening_balances (customer_id);

-- 2. Link columns -----------------------------------------------------------------
alter table public.sales_transactions add column if not exists customer_id uuid;
create index if not exists idx_sales_customer on public.sales_transactions (customer_id) where customer_id is not null;

alter table public.repayments add column if not exists method text not null default 'Cash';
alter table public.repayments add column if not exists session_id uuid;
alter table public.repayments add column if not exists recorded_by uuid;
alter table public.repayments add column if not exists effective_time timestamptz;

do $$
begin
  -- Existing repayments: date them by created_at when that column exists
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'repayments' and column_name = 'created_at') then
    execute 'update public.repayments set effective_time = coalesce(effective_time, created_at, now()) where effective_time is null';
  else
    update public.repayments set effective_time = now() where effective_time is null;
  end if;
end $$;
alter table public.repayments alter column effective_time set default now();
alter table public.repayments alter column effective_time set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'repayments_method_check') then
    alter table public.repayments add constraint repayments_method_check check (method in ('Cash', 'M-Pesa', 'Bank'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'repayments_session_id_fkey') then
    alter table public.repayments add constraint repayments_session_id_fkey
      foreign key (session_id) references public.milling_sessions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'repayments_recorded_by_fkey') then
    alter table public.repayments add constraint repayments_recorded_by_fkey
      foreign key (recorded_by) references public.profiles(id);
  end if;
end $$;
create index if not exists idx_repayments_customer on public.repayments (customer_id);
create index if not exists idx_repayments_session on public.repayments (session_id) where session_id is not null;

-- 3. Migrate customers (idempotent) -------------------------------------------------
insert into public.customers (id, name, phone, legacy_source)
select d.id, trim(d.customer_name), nullif(trim(d.customer_phone), ''), 'debt_book'
from public.debt_book d
where trim(coalesce(d.customer_name, '')) <> ''
  and not exists (select 1 from public.customers c where c.id = d.id);

-- Name-only debtors who only ever appeared on sales
insert into public.customers (name, phone, legacy_source)
select min(trim(s.customer_name)),
       (array_agg(nullif(trim(s.phone_number), '') order by coalesce(s.effective_time, s.created_at) desc)
          filter (where nullif(trim(s.phone_number), '') is not null))[1],
       'sales_name'
from public.sales_transactions s
where coalesce(s.amount_debt, 0) > 0
  and trim(coalesce(s.customer_name, '')) <> ''
  and upper(s.customer_name) not like '%WALK-IN%'
  and not exists (select 1 from public.customers c where upper(trim(c.name)) = upper(trim(s.customer_name)))
group by upper(trim(s.customer_name));

-- 4. Link sales to customers by unambiguous name -------------------------------------
-- Sale triggers (debt sync, inventory ledger) must not fire for this bookkeeping-only
-- update, or they could re-post stock movements. Disable only those currently enabled.
create temporary table _sales_triggers_disabled on commit drop as
  select tgname from pg_trigger
  where tgrelid = 'public.sales_transactions'::regclass and not tgisinternal and tgenabled <> 'D';

do $$
declare t record;
begin
  for t in select tgname from _sales_triggers_disabled loop
    execute format('alter table public.sales_transactions disable trigger %I', t.tgname);
  end loop;
end $$;

update public.sales_transactions s
set customer_id = c.id
from (
  select upper(trim(name)) as name_key, (array_agg(id))[1] as id, count(*) as n
  from public.customers group by 1
) c
where s.customer_id is null
  and upper(trim(s.customer_name)) = c.name_key
  and c.n = 1;

do $$
declare t record;
begin
  for t in select tgname from _sales_triggers_disabled loop
    execute format('alter table public.sales_transactions enable trigger %I', t.tgname);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_transactions_customer_id_fkey') then
    alter table public.sales_transactions add constraint sales_transactions_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;
end $$;

-- 5. Carry over each migrated customer's balance exactly -------------------------------
insert into public.customer_opening_balances (customer_id, amount, effective_time, note)
select x.id,
       x.adjustment,
       case when x.adjustment > 0 then coalesce(x.first_credit_at, now()) else now() end,
       'Carried over from debt_book on migration'
from (
  select d.id,
         round(
           (coalesce(d.original_debt, 0) - coalesce(d.amount_paid, 0))
           - (coalesce((select sum(s.amount_debt) from public.sales_transactions s where s.customer_id = d.id), 0)
              - coalesce((select sum(r.amount) from public.repayments r where r.customer_id = d.id), 0)),
         2) as adjustment,
         (select min(coalesce(s.effective_time, s.created_at)) from public.sales_transactions s
          where s.customer_id = d.id and s.amount_debt > 0) as first_credit_at
  from public.debt_book d
  where exists (select 1 from public.customers c where c.id = d.id)
) x
where x.adjustment <> 0
  and not exists (select 1 from public.customer_opening_balances o
                  where o.customer_id = x.id and o.note = 'Carried over from debt_book on migration');

-- 6. Repayments now belong to customers -------------------------------------------------
do $$
declare
  old_fk record;  -- not "c": that would shadow the customers alias below
  orphans int;
begin
  for old_fk in
    select con.conname from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.repayments'::regclass and con.contype = 'f'
      and a.attname = 'customer_id' and con.confrelid <> 'public.customers'::regclass
  loop
    execute format('alter table public.repayments drop constraint %I', old_fk.conname);
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'repayments_customer_id_customers_fkey') then
    -- NOT VALID: keeps any pre-existing orphan rows instead of failing; new rows are checked.
    alter table public.repayments add constraint repayments_customer_id_customers_fkey
      foreign key (customer_id) references public.customers(id) not valid;
  end if;

  select count(*) into orphans from public.repayments r
  where r.customer_id is not null and not exists (select 1 from public.customers c where c.id = r.customer_id);
  if orphans > 0 then
    raise notice '% repayment(s) point to no customer (possibly junk written while the table was publicly writable). Review: select * from repayments r where not exists (select 1 from customers c where c.id = r.customer_id);', orphans;
  end if;
end $$;

-- 7. Derived balances --------------------------------------------------------------------
create or replace view public.customer_balances with (security_invoker = true) as
select c.id as customer_id,
       c.name,
       c.phone,
       c.credit_limit,
       c.is_active,
       coalesce(o.amount, 0)                                          as opening,
       coalesce(s.credit_sales, 0)                                    as credit_sales,
       coalesce(r.repaid, 0)                                          as repayments,
       coalesce(o.amount, 0) + coalesce(s.credit_sales, 0) - coalesce(r.repaid, 0) as balance,
       greatest(s.last_sale_at, r.last_repayment_at)                  as last_activity
from public.customers c
left join (select customer_id, sum(amount) as amount
           from public.customer_opening_balances group by 1) o on o.customer_id = c.id
left join (select customer_id, sum(amount_debt) as credit_sales,
                  max(coalesce(effective_time, created_at)) as last_sale_at
           from public.sales_transactions where customer_id is not null group by 1) s on s.customer_id = c.id
left join (select customer_id, sum(amount) as repaid, max(effective_time) as last_repayment_at
           from public.repayments where customer_id is not null group by 1) r on r.customer_id = c.id;

-- 8. Security ------------------------------------------------------------------------------
create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN');
$$;

-- Cashiers can add and edit customer details; only admins can set or change credit limits.
create or replace function public.fn_guard_customer_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.fn_is_admin() then
    if (tg_op = 'INSERT' and new.credit_limit <> 0)
       or (tg_op = 'UPDATE' and new.credit_limit is distinct from old.credit_limit) then
      raise exception 'Only admins can set a customer''s credit limit.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;

drop trigger if exists trg_guard_customer_changes on public.customers;
create trigger trg_guard_customer_changes before insert or update on public.customers
for each row execute function public.fn_guard_customer_changes();

alter table public.customers enable row level security;
alter table public.customer_opening_balances enable row level security;
revoke all on table public.customers, public.customer_opening_balances, public.customer_balances from anon;
grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.customer_opening_balances to authenticated;
grant select on table public.customer_balances to authenticated;

drop policy if exists "customers_select" on public.customers;
drop policy if exists "customers_insert" on public.customers;
drop policy if exists "customers_update" on public.customers;
drop policy if exists "customers_delete" on public.customers;
create policy "customers_select" on public.customers for select to authenticated using (true);
create policy "customers_insert" on public.customers for insert to authenticated with check (true);
create policy "customers_update" on public.customers for update to authenticated using (true) with check (true);
create policy "customers_delete" on public.customers for delete to authenticated using (public.fn_is_admin());

drop policy if exists "opening_select" on public.customer_opening_balances;
drop policy if exists "opening_admin_write" on public.customer_opening_balances;
create policy "opening_select" on public.customer_opening_balances for select to authenticated using (true);
create policy "opening_admin_write" on public.customer_opening_balances for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

commit;

-- Verify after running:
--   select legacy_source, count(*) from customers group by 1;
--   select count(*) filter (where customer_id is not null) linked, count(*) total from sales_transactions;
--   select name, balance from customer_balances where balance <> 0 order by balance desc;
--   -- balances should equal the old debt_book (original_debt - amount_paid):
--   select d.customer_name, d.original_debt - d.amount_paid as old, b.balance as new
--   from debt_book d join customer_balances b on b.customer_id = d.id
--   where round(d.original_debt - d.amount_paid, 2) <> round(b.balance, 2);
