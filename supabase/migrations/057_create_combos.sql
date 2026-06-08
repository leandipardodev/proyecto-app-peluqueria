-- Create combos table for predefined service bundles
create table if not exists public.combos (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  name        text not null,
  description text,
  price       numeric not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint combos_price_check check (price >= 0)
);

-- Junction table linking combos to their services
create table if not exists public.combo_services (
  id         uuid primary key default gen_random_uuid(),
  combo_id   uuid not null references public.combos(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(combo_id, service_id)
);

-- Indexes
create index if not exists idx_combos_shop_id on public.combos(shop_id);
create index if not exists idx_combo_services_combo_id on public.combo_services(combo_id);

-- Enable RLS
alter table if exists public.combos enable row level security;
alter table if exists public.combo_services enable row level security;

-- Combos policies: owners can do everything
drop policy if exists "combos_owner_all" on public.combos;
create policy "combos_owner_all" on public.combos
  for all
  using (
    exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = combos.shop_id
        and sm.user_id = auth.uid()
        and sm.role = 'owner'
        and sm.is_active = true
    )
  );

-- Combo_services policies: owners can do everything
drop policy if exists "combo_services_owner_all" on public.combo_services;
create policy "combo_services_owner_all" on public.combo_services
  for all
  using (
    exists (
      select 1 from public.combos c
      join public.shop_memberships sm on sm.shop_id = c.shop_id
      where c.id = combo_services.combo_id
        and sm.user_id = auth.uid()
        and sm.role = 'owner'
        and sm.is_active = true
    )
  );

-- Public read-only policy for combos (used in booking)
drop policy if exists "combos_select_active" on public.combos;
create policy "combos_select_active" on public.combos
  for select
  using (active = true);
