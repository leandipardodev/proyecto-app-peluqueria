begin;

create table if not exists public.shop_billing_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_shop_billing_events_shop_id
  on public.shop_billing_events(shop_id);

create index if not exists idx_shop_billing_events_created_at
  on public.shop_billing_events(created_at desc);

alter table public.shop_billing_events enable row level security;

drop policy if exists shop_billing_events_select_member on public.shop_billing_events;
create policy shop_billing_events_select_member
on public.shop_billing_events
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.user_id = auth.uid()
      and sm.shop_id = shop_billing_events.shop_id
      and sm.is_active = true
  )
);

commit;
