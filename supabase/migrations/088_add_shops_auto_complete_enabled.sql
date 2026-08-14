-- Auto-completar turnos: flag por local, apagado por defecto.
alter table public.shops
  add column if not exists auto_complete_enabled boolean not null default false;
