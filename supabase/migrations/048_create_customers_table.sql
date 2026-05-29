-- Version the customers table DDL (was previously created manually outside migrations)
-- Safe: only creates if not exists

begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  user_id uuid,
  nombre text not null,
  email text,
  telefono text,
  loyalty_cuts_count integer not null default 0 check (loyalty_cuts_count >= 0),
  loyalty_rewards_available integer not null default 0 check (loyalty_rewards_available >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_shop_id on public.customers(shop_id);
create index if not exists idx_customers_shop_phone on public.customers(shop_id, telefono);
create index if not exists idx_customers_loyalty_rewards_available
  on public.customers(shop_id, loyalty_rewards_available);

commit;
