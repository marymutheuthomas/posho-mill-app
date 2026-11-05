-- 1. daily_audits: the till counts logged with "Log cash drop" on the Dashboard.
--    The live database had no such table, so every cash drop failed.
-- 2. Only admins may change product prices and milling fees.
--
-- Access for daily_audits (same model as audit_exceptions):
--   select   admins see all; staff see the cash drops they logged
--   insert   any signed-in user (also replayed by the offline sync)
--   update / delete   admins only;   anon   no access
--
-- Price guard: a trigger, not an RLS rule, because sales, purchases and production change
-- products.current_stock through triggers that run as the signed-in cashier. Blocking all
-- updates for staff would break every sale; this blocks only changes to the price columns.
--
-- Requires public.fn_is_admin() from 20261104000000_customer_crm_ledger.sql. Safe to re-run.

begin;

-- 1. Cash drops ----------------------------------------------------------------------------
create table if not exists public.daily_audits (
  id                    uuid primary key default gen_random_uuid(),
  audit_date            date not null default ((now() at time zone 'Africa/Nairobi')::date),
  actual_cash_collected numeric(12,2) not null check (actual_cash_collected >= 0),
  cash_amount           numeric(12,2) check (cash_amount >= 0),
  mpesa_amount          numeric(12,2) check (mpesa_amount >= 0),
  notes                 text,
  recorded_by           uuid references public.profiles(id) on delete set null,
  created_at            timestamp with time zone not null default now()
);

create index if not exists idx_daily_audits_date on public.daily_audits (audit_date);

alter table public.daily_audits enable row level security;
revoke all on table public.daily_audits from anon;
grant select, insert, update, delete on table public.daily_audits to authenticated;

drop policy if exists "daily_audits_select" on public.daily_audits;
drop policy if exists "daily_audits_insert" on public.daily_audits;
drop policy if exists "daily_audits_update" on public.daily_audits;
drop policy if exists "daily_audits_delete" on public.daily_audits;

create policy "daily_audits_select" on public.daily_audits for select to authenticated
  using (public.fn_is_admin() or recorded_by = auth.uid());
create policy "daily_audits_insert" on public.daily_audits for insert to authenticated
  with check (true);
create policy "daily_audits_update" on public.daily_audits for update to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());
create policy "daily_audits_delete" on public.daily_audits for delete to authenticated
  using (public.fn_is_admin());

-- 2. Price guard ---------------------------------------------------------------------------
create or replace function public.fn_guard_product_prices() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.fn_is_admin()
     and (new.selling_price is distinct from old.selling_price
          or new.milling_fee is distinct from old.milling_fee) then
    raise exception 'Only admins can change prices and milling fees.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_product_prices on public.products;
create trigger trg_guard_product_prices before update on public.products
for each row execute function public.fn_guard_product_prices();

commit;

-- Verify:
--   select relrowsecurity from pg_class where relname = 'daily_audits';            -- t
--   select tgname from pg_trigger where tgname = 'trg_guard_product_prices';       -- 1 row
