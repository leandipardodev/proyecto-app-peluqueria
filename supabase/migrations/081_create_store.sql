-- Store unified with inventory: stock items are the products. `for_sale` enables
-- the online store, sale fields live directly on public.stock.
alter table public.stock
  add column if not exists for_sale    boolean not null default false,
  add column if not exists price       numeric not null default 0,
  add column if not exists description text,
  add column if not exists image_url   text,
  add column if not exists category    text,
  add column if not exists visible     boolean not null default true;
alter table public.stock
  drop constraint if exists stock_price_check;
alter table public.stock
  add constraint stock_price_check check (price >= 0);

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  customer_name    text not null,
  customer_email   text not null,
  customer_phone   text,
  status           text not null default 'pending_payment',
  payment_method   text not null default 'mp',
  total_amount     numeric not null default 0,
  mp_preference_id text,
  mp_payment_id    text,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint orders_status_check check (status in ('pending_payment', 'paid', 'cancelled', 'expired')),
  constraint orders_payment_method_check check (payment_method in ('mp', 'bank_transfer')),
  constraint orders_total_check check (total_amount >= 0)
);

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.stock(id) on delete set null,
  product_name text not null,
  unit_price   numeric not null default 0,
  quantity     integer not null default 1,
  created_at   timestamptz not null default now(),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_price_check check (unit_price >= 0)
);

-- Indexes
create index if not exists idx_stock_shop_sellable on public.stock(shop_id)
  where for_sale = true and visible = true;
create index if not exists idx_orders_shop_id on public.orders(shop_id);
create index if not exists idx_orders_shop_created on public.orders(shop_id, created_at desc);
create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- Enable RLS
alter table if exists public.orders enable row level security;
alter table if exists public.order_items enable row level security;

-- Atomic stock helpers (supabase-js cannot express `set quantity = quantity - n`)
create or replace function public.decrement_stock(p_stock_id uuid, p_shop_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.stock
     set quantity = quantity - p_qty,
         updated_at = now()
   where id = p_stock_id
     and shop_id = p_shop_id
     and quantity >= p_qty;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.restore_stock(p_stock_id uuid, p_shop_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.stock
     set quantity = quantity + p_qty,
         updated_at = now()
   where id = p_stock_id
     and shop_id = p_shop_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- stock (via existing "RLS_MultiLocal_v2_Strict"): members owner/admin/staff manage
-- all columns. Anonymous can read published products (public store uses service role).
drop policy if exists "stock_public_select" on public.stock;
create policy "stock_public_select" on public.stock
  as permissive for select to anon
  using (for_sale = true and visible = true);

-- orders: members read, owner/admin manage
drop policy if exists "orders_manage" on public.orders;
create policy "orders_manage" on public.orders
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = orders.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = orders.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "orders_staff_select" on public.orders;
create policy "orders_staff_select" on public.orders
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = orders.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

-- order_items: members read, owner/admin manage
drop policy if exists "order_items_manage" on public.order_items;
create policy "order_items_manage" on public.order_items
  as permissive for all to authenticated
  using (exists (
    select 1 from public.orders o
    join public.shop_memberships sm on sm.shop_id = o.shop_id
    where o.id = order_items.order_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.orders o
    join public.shop_memberships sm on sm.shop_id = o.shop_id
    where o.id = order_items.order_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "order_items_staff_select" on public.order_items;
create policy "order_items_staff_select" on public.order_items
  as permissive for select to authenticated
  using (exists (
    select 1 from public.orders o
    join public.shop_memberships sm on sm.shop_id = o.shop_id
    where o.id = order_items.order_id and sm.user_id = auth.uid() and sm.is_active = true
  ));
