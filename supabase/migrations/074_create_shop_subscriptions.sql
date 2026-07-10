create table if not exists public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  preapproval_id text not null,
  payer_id text not null,
  card_id text,
  status text not null default 'authorized' check (status in ('authorized', 'paused', 'cancelled')),
  next_charge_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_subscriptions_preapproval_id_key unique (preapproval_id)
);

create index if not exists idx_shop_subscriptions_shop_id on public.shop_subscriptions(shop_id);
create index if not exists idx_shop_subscriptions_preapproval_id on public.shop_subscriptions(preapproval_id);
create index if not exists idx_shop_subscriptions_status on public.shop_subscriptions(status);

alter table if exists public.shop_subscriptions enable row level security;

-- Only authenticated members of the shop can view subscriptions
create policy "shop_subscriptions_select_members" on public.shop_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = shop_subscriptions.shop_id
        and sm.user_id = auth.uid()
        and sm.is_active = true
    )
  );

-- Only owners/admins can insert subscriptions
create policy "shop_subscriptions_insert_admin" on public.shop_subscriptions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = shop_subscriptions.shop_id
        and sm.user_id = auth.uid()
        and sm.is_active = true
        and sm.role in ('owner', 'admin')
    )
  );

-- Only owners/admins can update subscriptions
create policy "shop_subscriptions_update_admin" on public.shop_subscriptions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = shop_subscriptions.shop_id
        and sm.user_id = auth.uid()
        and sm.is_active = true
        and sm.role in ('owner', 'admin')
    )
  );

-- Only owners/admins can delete subscriptions
create policy "shop_subscriptions_delete_admin" on public.shop_subscriptions
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = shop_subscriptions.shop_id
        and sm.user_id = auth.uid()
        and sm.is_active = true
        and sm.role in ('owner', 'admin')
    )
  );

-- Trigger for updated_at
create or replace function public.handle_shop_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shop_subscriptions_updated_at on public.shop_subscriptions;
create trigger trg_shop_subscriptions_updated_at before update on public.shop_subscriptions
  for each row execute function public.handle_shop_subscriptions_updated_at();
