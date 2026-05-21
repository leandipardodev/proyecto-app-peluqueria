begin;

alter table public.shop_booking_theme
add column if not exists section_order text[] not null default array['General']::text[];

commit;
