-- Asignar profesional por el dueno: flag por local.
-- false = el cliente elige profesional; true = el sistema/dueno asigna.
-- Default por industria (masajista y canchas asignan el dueno).
alter table public.shops
  add column if not exists assign_staff_later boolean not null default false;

-- Backfill de locales existentes segun industria.
update public.shops
set assign_staff_later = true
where industry in ('masajista', 'canchas');
