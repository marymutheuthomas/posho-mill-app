-- "Approve & Lock": once an audit exception is APPROVED it can no longer be edited or
-- re-opened by anyone using the app (admins included). Deleting stays admin-only via RLS.
-- The service role (Supabase dashboard / SQL editor) can still correct a row if ever needed.
--
-- Requires 20261105000000_audit_exceptions.sql. Safe to re-run.

begin;

create or replace function public.fn_lock_approved_audit_exceptions() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'APPROVED' and auth.role() <> 'service_role' then
    raise exception 'This exception was approved and is locked.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_approved_audit_exceptions on public.audit_exceptions;
create trigger trg_lock_approved_audit_exceptions before update on public.audit_exceptions
for each row execute function public.fn_lock_approved_audit_exceptions();

commit;
