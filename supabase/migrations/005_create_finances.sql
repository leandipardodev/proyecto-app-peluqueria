-- Migration: Create finances table
-- Description: Tracks daily income/expense records for each shop

create table if not exists finances (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid references shops(id) on delete cascade not null,
    amount numeric(10,2) not null check (amount > 0),
    type text not null check (type in ('income', 'expense')),
    category text not null,
    description text,
    created_at timestamp with time zone default now()
);

alter table finances enable row level security;

-- Superadmin bypass
drop policy if exists superadmin_finances on finances;
create policy superadmin_finances on finances for all
    using (is_superadmin()) with check (is_superadmin());

-- Users can view their own shop's finances
drop policy if exists view_shop_finances on finances;
create policy view_shop_finances on finances for select
    using (shop_id = get_user_shop_id());

-- Users can manage their own shop's finances
drop policy if exists manage_shop_finances on finances;
create policy manage_shop_finances on finances for all
    using (shop_id = get_user_shop_id()) with check (shop_id = get_user_shop_id());

create index if not exists idx_finances_shop_id on finances(shop_id);
create index if not exists idx_finances_created_at on finances(created_at);
