create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_events_shop_occurred
  on public.product_events (shop_id, occurred_at desc);

create index if not exists idx_product_events_type_occurred
  on public.product_events (event_type, occurred_at desc);

create table if not exists public.product_event_markers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  marker_key text not null,
  created_at timestamptz not null default now(),
  unique (shop_id, marker_key)
);

alter table public.product_events enable row level security;
alter table public.product_event_markers enable row level security;

drop policy if exists "service_role_all_product_events" on public.product_events;
create policy "service_role_all_product_events"
  on public.product_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_product_event_markers" on public.product_event_markers;
create policy "service_role_all_product_event_markers"
  on public.product_event_markers
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
