-- Date-specific overrides for shop closures and staff exceptions
-- staff_id = null → shop-wide holiday/closure
-- staff_id = <uuid> → staff-specific exception (vacation, reduced hours, etc.)
-- is_closed = true → closed that day
-- is_closed = false + start_time/end_time → reduced hours for that day

create table if not exists shop_date_overrides (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  staff_id   uuid references user_profiles(user_id) on delete cascade,
  date       date not null,
  is_closed  boolean not null default true,
  start_time time,
  end_time   time,
  reason     text,
  created_at timestamptz default now()
);

-- Prevent duplicate shop-wide overrides for the same date
create unique index if not exists idx_shop_date_overrides_shop_global
  on shop_date_overrides (shop_id, date)
  where staff_id is null;

-- Prevent duplicate staff-specific overrides for the same staff+date
create unique index if not exists idx_shop_date_overrides_staff
  on shop_date_overrides (shop_id, staff_id, date)
  where staff_id is not null;
