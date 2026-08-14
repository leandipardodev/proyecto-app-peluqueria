-- Marca los turnos que fueron auto-completados para que, si se reabren
-- manualmente, no vuelvan a auto-completarse.
alter table public.appointments
  add column if not exists auto_completed boolean not null default false;

create index if not exists appointments_auto_completed_idx
  on public.appointments (shop_id, status, end_time)
  where auto_completed = false;
