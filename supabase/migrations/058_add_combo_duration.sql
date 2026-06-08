alter table if exists public.combos
  add column if not exists duration_minutes integer;

-- Allow owners to set a custom duration per combo (nullable — falls back to sum of services)
-- constraint combos_duration_minutes_check check (duration_minutes is null or duration_minutes > 0)
