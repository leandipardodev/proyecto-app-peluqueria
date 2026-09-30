-- 105: RLS on the four tenant tables that were never protected
--
-- shop_date_overrides, staff_schedules, staff_services y staff_profiles se
-- crearon sin `enable row level security`. Con la anon key publica en el
-- bundle del navegador, eso permitia a cualquiera (sin sesion) leer Y
-- escribir: horarios y pausas de cada profesional de cada salon, y cerrar un
-- dia completo de la competencia.
--
-- IMPACTO EN EL FLUJO PUBLICO /book: ninguno. Todos los lectores de estas
-- tablas en el camino de reserva usan service role (createAdminClient), que
-- ignora RLS por definicion:
--   public-booking-actions.ts:369,550,738,1032,1209  (staff_schedules)
--   public-booking-actions.ts:353,665,694,1147,1168  (staff_services)
--   public-booking-actions.ts:46                      (shop_date_overrides)
--   book/[slug]/page.tsx:68-69                        (staff_services/profiles)
-- Unico lector con RLS real: app/client/book/page.tsx:63 (createServerClient).
-- Ese portal ya esta roto por otra causa (getShopId no resuelve rol
-- `customer`), asi que no se pierde funcionalidad.
--
-- NOTA SOBRE LOS HELPERS: las politicas necesitan consultar las membresias
-- de OTRO usuario (el profesional dueño de la fila). shop_memberships tiene
-- RLS con politica "select own", asi que una politica normal solo veria la
-- fila del caller y nunca matchearia staff_schedules.staff_id. Por eso los
-- checks viven en funciones SECURITY DEFINER: corren como owner (postgres) y
-- saltan RLS. auth.uid() sigue leyendo el claim del JWT real, asi que el
-- resultado siempre refleja al caller que invoco la policy.
--
-- Idempotente: se puede correr mas de una vez sin error.

-- ---------------------------------------------------------------------------
-- Helpers de membresia
-- ---------------------------------------------------------------------------
create or replace function public.is_shop_member(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = p_shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  );
$$;

create or replace function public.can_manage_shop(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = p_shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  );
$$;

-- El usuario (caller) comparte al menos un local con el profesional dado.
create or replace function public.shares_shop_with_staff(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_memberships target
    join public.shop_memberships mine
      on mine.shop_id = target.shop_id
    where target.user_id = p_staff_id
      and target.is_active = true
      and mine.user_id = auth.uid()
      and mine.is_active = true
      and mine.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  );
$$;

-- El usuario (caller) administra algun local del profesional dado.
create or replace function public.manages_staff(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_memberships target
    join public.shop_memberships mine
      on mine.shop_id = target.shop_id
    where target.user_id = p_staff_id
      and target.is_active = true
      and mine.user_id = auth.uid()
      and mine.is_active = true
      and mine.role = any (array['owner'::text, 'admin'::text])
  );
$$;

revoke all on function public.is_shop_member(uuid) from public;
revoke all on function public.can_manage_shop(uuid) from public;
revoke all on function public.shares_shop_with_staff(uuid) from public;
revoke all on function public.manages_staff(uuid) from public;

grant execute on function public.is_shop_member(uuid) to authenticated, service_role;
grant execute on function public.can_manage_shop(uuid) to authenticated, service_role;
grant execute on function public.shares_shop_with_staff(uuid) to authenticated, service_role;
grant execute on function public.manages_staff(uuid) to authenticated, service_role;

-- ===========================================================================
-- 1. shop_date_overrides  (tiene shop_id directo)
-- ===========================================================================
alter table public.shop_date_overrides enable row level security;

drop policy if exists "shop_date_overrides_select_members" on public.shop_date_overrides;
create policy "shop_date_overrides_select_members"
  on public.shop_date_overrides
  as permissive for select to authenticated
  using (public.is_shop_member(shop_date_overrides.shop_id));

drop policy if exists "shop_date_overrides_manage" on public.shop_date_overrides;
create policy "shop_date_overrides_manage"
  on public.shop_date_overrides
  as permissive for all to authenticated
  using (public.can_manage_shop(shop_date_overrides.shop_id))
  with check (public.can_manage_shop(shop_date_overrides.shop_id));

-- ===========================================================================
-- 2. staff_schedules  (sin shop_id: se resuelve via shop_memberships)
-- ===========================================================================
alter table public.staff_schedules enable row level security;

drop policy if exists "staff_schedules_select_members" on public.staff_schedules;
create policy "staff_schedules_select_members"
  on public.staff_schedules
  as permissive for select to authenticated
  using (public.shares_shop_with_staff(staff_schedules.staff_id));

drop policy if exists "staff_schedules_manage" on public.staff_schedules;
create policy "staff_schedules_manage"
  on public.staff_schedules
  as permissive for all to authenticated
  using (public.manages_staff(staff_schedules.staff_id))
  with check (public.manages_staff(staff_schedules.staff_id));

-- ===========================================================================
-- 3. staff_services  (sin shop_id: se resuelve via el staff o via el service)
-- ===========================================================================
alter table public.staff_services enable row level security;

drop policy if exists "staff_services_select_members" on public.staff_services;
create policy "staff_services_select_members"
  on public.staff_services
  as permissive for select to authenticated
  using (
    public.shares_shop_with_staff(staff_services.staff_id)
    or public.is_shop_member(
         (select s.shop_id from public.services s where s.id = staff_services.service_id)
       )
  );

drop policy if exists "staff_services_manage" on public.staff_services;
create policy "staff_services_manage"
  on public.staff_services
  as permissive for all to authenticated
  using (
    public.manages_staff(staff_services.staff_id)
    or public.can_manage_shop(
         (select s.shop_id from public.services s where s.id = staff_services.service_id)
       )
  )
  with check (
    public.manages_staff(staff_services.staff_id)
    or public.can_manage_shop(
         (select s.shop_id from public.services s where s.id = staff_services.service_id)
       )
  );

-- ===========================================================================
-- 4. staff_profiles  (sin shop_id: user_id es un user_profiles)
-- ===========================================================================
alter table public.staff_profiles enable row level security;

drop policy if exists "staff_profiles_select_members" on public.staff_profiles;
create policy "staff_profiles_select_members"
  on public.staff_profiles
  as permissive for select to authenticated
  using (public.shares_shop_with_staff(staff_profiles.user_id));

drop policy if exists "staff_profiles_manage" on public.staff_profiles;
create policy "staff_profiles_manage"
  on public.staff_profiles
  as permissive for all to authenticated
  using (public.manages_staff(staff_profiles.user_id))
  with check (public.manages_staff(staff_profiles.user_id));

-- ===========================================================================
-- Indice de soporte: las politicas recorren shop_memberships por user_id y el
-- baseline solo lo indexa por (shop_id, user_id).
-- ===========================================================================
create index if not exists idx_shop_memberships_user_active
  on public.shop_memberships (user_id, is_active)
  where is_active = true;
