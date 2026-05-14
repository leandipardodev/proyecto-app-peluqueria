begin;

alter table public.appointments
  add column if not exists loyalty_reward_applied boolean not null default false,
  add column if not exists loyalty_discount_percent_applied integer not null default 0;

alter table public.appointments
  drop constraint if exists appointments_loyalty_discount_percent_applied_check;

alter table public.appointments
  add constraint appointments_loyalty_discount_percent_applied_check
  check (loyalty_discount_percent_applied >= 0 and loyalty_discount_percent_applied <= 100);

commit;
