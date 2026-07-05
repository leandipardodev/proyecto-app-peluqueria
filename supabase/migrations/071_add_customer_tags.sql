alter table if exists public.customers
  add column if not exists tags text[] not null default '{}';
