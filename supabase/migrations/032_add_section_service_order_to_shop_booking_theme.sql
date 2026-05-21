begin;

alter table public.shop_booking_theme
add column if not exists section_service_order text[] not null default array[]::text[];

commit;
