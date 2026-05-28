-- 1. Agregar "canchas" al CHECK constraint de shops.industry
alter table public.shops
drop constraint if exists shops_industry_check;

alter table public.shops
add constraint shops_industry_check
check (industry in ('peluqueria', 'psicologo', 'masajista', 'canchas'));

-- 2. Crear tabla industry_config para feature flags editables
create table if not exists public.industry_config (
  industry text primary key,
  features jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- 3. Seed con valores por defecto
insert into public.industry_config (industry, features) values
  ('peluqueria', '{"inventory": true}'::jsonb),
  ('psicologo',  '{"inventory": false}'::jsonb),
  ('masajista',  '{"inventory": false}'::jsonb),
  ('canchas',    '{"inventory": false}'::jsonb)
on conflict (industry) do nothing;

-- 4. Disparador para actualizar updated_at
create or replace function public.update_industry_config_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_industry_config_timestamp on public.industry_config;
create trigger trg_update_industry_config_timestamp
before update on public.industry_config
for each row execute function public.update_industry_config_timestamp();

-- 5. RLS: solo admins pueden leer/escribir
alter table public.industry_config enable row level security;

create policy "Admins pueden leer industry_config"
  on public.industry_config
  for select
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = auth.uid()
      and user_profiles.role = 'super_admin'
    )
  );

create policy "Admins pueden actualizar industry_config"
  on public.industry_config
  for update
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = auth.uid()
      and user_profiles.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = auth.uid()
      and user_profiles.role = 'super_admin'
    )
  );

grant select, update on public.industry_config to authenticated;
