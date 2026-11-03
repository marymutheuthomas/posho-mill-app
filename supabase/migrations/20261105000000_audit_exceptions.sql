-- Audit exception queue: stock drifts, power/production mismatches and un-metered
-- transactions captured for admin review.
--
-- Access (same model as sales and the customer CRM):
--   select   admins see everything; staff see only the exceptions they recorded
--   insert   any signed-in user (the app and its offline sync raise exceptions)
--   update   admins only (approving an exception)
--   delete   admins only
--   anon     no access
--
-- Requires public.fn_is_admin() from 20261104000000_customer_crm_ledger.sql.
-- Safe to re-run. Run in the Supabase SQL editor.

begin;

create table if not exists public.audit_exceptions (
  id              uuid not null default gen_random_uuid(),
  exception_type  text not null,
  description     text not null,
  severity        text not null default 'WARNING',
  status          text not null default 'PENDING_ADMIN_APPROVAL',
  recorded_by     uuid references public.profiles(id) on delete set null,
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamp with time zone,
  effective_time  timestamp with time zone default now(),
  created_at      timestamp with time zone default now(),
  constraint audit_exceptions_pkey primary key (id),
  constraint audit_exceptions_type_check
    check (exception_type in ('INVENTORY_DRIFT', 'POWER_YIELD_MISMATCH', 'UNMETERED_TRANSACTION')),
  constraint audit_exceptions_severity_check
    check (severity in ('WARNING', 'CRITICAL')),
  constraint audit_exceptions_status_check
    check (status in ('PENDING_ADMIN_APPROVAL', 'APPROVED')),
  -- An approved exception always says who approved it and when
  constraint audit_exceptions_approval_check
    check (status <> 'APPROVED' or (approved_by is not null and approved_at is not null))
);

create index if not exists idx_audit_exceptions_status on public.audit_exceptions (status);
create index if not exists idx_audit_exceptions_time   on public.audit_exceptions (effective_time);

-- Security ----------------------------------------------------------------------------------
alter table public.audit_exceptions enable row level security;
revoke all on table public.audit_exceptions from anon;
grant select, insert, update, delete on table public.audit_exceptions to authenticated;

drop policy if exists "audit_exceptions_select" on public.audit_exceptions;
drop policy if exists "audit_exceptions_insert" on public.audit_exceptions;
drop policy if exists "audit_exceptions_update" on public.audit_exceptions;
drop policy if exists "audit_exceptions_delete" on public.audit_exceptions;

create policy "audit_exceptions_select" on public.audit_exceptions for select to authenticated
  using (public.fn_is_admin() or recorded_by = auth.uid());
create policy "audit_exceptions_insert" on public.audit_exceptions for insert to authenticated
  with check (true);
create policy "audit_exceptions_update" on public.audit_exceptions for update to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());
create policy "audit_exceptions_delete" on public.audit_exceptions for delete to authenticated
  using (public.fn_is_admin());

commit;

-- Verify:
--   select policyname, cmd from pg_policies where tablename = 'audit_exceptions' order by 1;
--   select relrowsecurity from pg_class where relname = 'audit_exceptions';   -- expect t
