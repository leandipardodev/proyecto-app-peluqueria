-- Align Shop Model across core business tables
-- Safe migration: adds nullable columns first, then backfills.

begin;

alter table if exists public.customers
  add column if not exists shop_id uuid;

alter table if exists public.services
  add column if not exists shop_id uuid;

alter table if exists public.appointments
  add column if not exists shop_id uuid;

-- "staff" is represented by user_profiles in this project.
alter table if exists public.user_profiles
  add column if not exists shop_id uuid;

-- Backfill customers.shop_id from owner profile relation (customers.user_id -> user_profiles.user_id)
update public.customers c
set shop_id = up.shop_id
from public.user_profiles up
where c.shop_id is null
  and c.user_id is not null
  and up.user_id = c.user_id
  and up.shop_id is not null;

-- Backfill appointments.shop_id from service relation first
update public.appointments a
set shop_id = s.shop_id
from public.services s
where a.shop_id is null
  and a.service_id = s.id
  and s.shop_id is not null;

-- Fallback: backfill appointments.shop_id from customer relation
update public.appointments a
set shop_id = c.shop_id
from public.customers c
where a.shop_id is null
  and a.customer_id = c.id
  and c.shop_id is not null;

-- Add foreign keys (idempotent via exception handling)
do $$
begin
  begin
    alter table public.customers
      add constraint customers_shop_id_fkey
      foreign key (shop_id) references public.shops(id) on delete set null;
  exception when duplicate_object then null;
  end;

  begin
    alter table public.services
      add constraint services_shop_id_fkey
      foreign key (shop_id) references public.shops(id) on delete set null;
  exception when duplicate_object then null;
  end;

  begin
    alter table public.appointments
      add constraint appointments_shop_id_fkey
      foreign key (shop_id) references public.shops(id) on delete set null;
  exception when duplicate_object then null;
  end;

  begin
    alter table public.user_profiles
      add constraint user_profiles_shop_id_fkey
      foreign key (shop_id) references public.shops(id) on delete set null;
  exception when duplicate_object then null;
  end;
end $$;

create index if not exists idx_customers_shop_id on public.customers(shop_id);
create index if not exists idx_services_shop_id on public.services(shop_id);
create index if not exists idx_appointments_shop_id on public.appointments(shop_id);
create index if not exists idx_user_profiles_shop_id on public.user_profiles(shop_id);

commit;
