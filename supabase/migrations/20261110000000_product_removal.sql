-- Removing wrong products (Settings -> Remove selected, admins only).
--
-- A product that was ever sold, milled, bought, counted or moved in the ledger is referenced
-- by that history, so it is HIDDEN (is_active = false): it disappears from the POS, Production
-- Hub, Stock Take and Purchases lists while past records and reports stay correct. A product
-- with no history at all is deleted. The app decides which, and falls back to hiding if the
-- database refuses a delete.
--
-- Also extends the 20261109 guard: only admins may delete products or hide/restore them.

begin;

-- Admin check used by the rules below. Also defined in 20261104; repeated here (identical)
-- so this file works on its own on databases where 20261104 was not fully applied.
create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN');
$$;

alter table public.products add column if not exists is_active boolean not null default true;

create or replace function public.fn_guard_product_prices() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.fn_is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Only admins can remove products.' using errcode = '42501';
  end if;
  if new.selling_price is distinct from old.selling_price
     or new.milling_fee is distinct from old.milling_fee then
    raise exception 'Only admins can change prices and milling fees.' using errcode = '42501';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'Only admins can hide or restore products.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_product_prices on public.products;
create trigger trg_guard_product_prices before update or delete on public.products
for each row execute function public.fn_guard_product_prices();

-- Admins need the privilege to delete at all; the trigger above keeps staff out.
grant delete on table public.products to authenticated;

do $$
begin
  if (select relrowsecurity from pg_class where oid = 'public.products'::regclass) then
    drop policy if exists "products_admin_delete" on public.products;
    create policy "products_admin_delete" on public.products for delete to authenticated
      using (public.fn_is_admin());
  end if;
end $$;

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'products' and column_name = 'is_active';
