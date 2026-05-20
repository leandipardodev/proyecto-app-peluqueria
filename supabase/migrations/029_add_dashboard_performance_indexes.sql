begin;

create index if not exists idx_appointments_shop_start_status
  on public.appointments(shop_id, start_time, status);

create index if not exists idx_stock_shop_quantity
  on public.stock(shop_id, quantity);

create index if not exists idx_shop_memberships_user_active
  on public.shop_memberships(user_id, is_active);

commit;
