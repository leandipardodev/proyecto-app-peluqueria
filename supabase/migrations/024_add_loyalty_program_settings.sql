begin;

alter table public.shops
  add column if not exists loyalty_enabled boolean not null default true,
  add column if not exists loyalty_cuts_required integer not null default 10,
  add column if not exists loyalty_discount_percent integer not null default 10;

alter table public.shops
  drop constraint if exists shops_loyalty_cuts_required_check;

alter table public.shops
  add constraint shops_loyalty_cuts_required_check
  check (loyalty_cuts_required >= 1);

alter table public.shops
  drop constraint if exists shops_loyalty_discount_percent_check;

alter table public.shops
  add constraint shops_loyalty_discount_percent_check
  check (loyalty_discount_percent >= 0 and loyalty_discount_percent <= 100);

alter table public.customers
  add column if not exists loyalty_cuts_count integer not null default 0,
  add column if not exists loyalty_rewards_available integer not null default 0;

alter table public.customers
  drop constraint if exists customers_loyalty_cuts_count_check;

alter table public.customers
  add constraint customers_loyalty_cuts_count_check
  check (loyalty_cuts_count >= 0);

alter table public.customers
  drop constraint if exists customers_loyalty_rewards_available_check;

alter table public.customers
  add constraint customers_loyalty_rewards_available_check
  check (loyalty_rewards_available >= 0);

create index if not exists idx_customers_loyalty_rewards_available
  on public.customers(shop_id, loyalty_rewards_available);

commit;
