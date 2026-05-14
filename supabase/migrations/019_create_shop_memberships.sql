begin;

create table if not exists public.shop_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (user_id, shop_id)
);

create index if not exists idx_shop_memberships_user_id on public.shop_memberships(user_id);
create index if not exists idx_shop_memberships_shop_id on public.shop_memberships(shop_id);

insert into public.shop_memberships (user_id, shop_id, role, is_active)
select up.user_id, up.shop_id, up.role, coalesce(up.is_active, true)
from public.user_profiles up
where up.shop_id is not null
  and up.role in ('owner', 'admin', 'staff')
on conflict (user_id, shop_id) do update
set role = excluded.role,
    is_active = excluded.is_active,
    updated_at = now();

alter table public.shop_memberships enable row level security;

drop policy if exists shop_memberships_select_own on public.shop_memberships;
create policy shop_memberships_select_own
on public.shop_memberships
for select
to authenticated
using (user_id = auth.uid());

commit;
