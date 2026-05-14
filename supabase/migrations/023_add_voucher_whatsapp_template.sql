begin;

alter table public.shops
  add column if not exists voucher_whatsapp_template text;

commit;
