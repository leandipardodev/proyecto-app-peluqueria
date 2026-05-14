begin;

alter table public.shops
  add column if not exists booking_deposit_enabled boolean not null default true,
  add column if not exists booking_deposit_amount numeric(10,2) not null default 5000;

alter table public.shops
  drop constraint if exists shops_booking_deposit_amount_check;

alter table public.shops
  add constraint shops_booking_deposit_amount_check
  check (booking_deposit_amount >= 0);

commit;
