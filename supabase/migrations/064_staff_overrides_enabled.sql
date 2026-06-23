alter table if exists public.staff_compensation_rules
  add column if not exists overrides_enabled boolean not null default false;
