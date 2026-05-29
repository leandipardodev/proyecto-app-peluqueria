-- 000_baseline.sql
-- Baseline del schema real de la base de datos.
-- Crea todas las tablas, funciones, índices, triggers y políticas RLS.
-- Seguro para correr tanto en DB existente (idempotente) como en una fresh.

-- ============================================================
-- EXTENSIONES
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- FUNCIONES
-- ============================================================

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public as $$
  select up.shop_id
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_active_shop(p_shop_id uuid)
returns boolean
language sql
stable as $$
  select exists (select 1 from public.shops where id = p_shop_id and active = true)
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role = 'super_admin'
  )
$$;

create or replace function public.generate_shop_slug(shop_name text)
returns text
language plpgsql as $$
declare
  base_slug text;
  final_slug text;
  counter int := 0;
begin
  base_slug := lower(shop_name);
  base_slug := regexp_replace(base_slug, 'á|à|ä|â', 'a', 'g');
  base_slug := regexp_replace(base_slug, 'é|è|ë|ê', 'e', 'g');
  base_slug := regexp_replace(base_slug, 'í|ì|ï|î', 'i', 'g');
  base_slug := regexp_replace(base_slug, 'ó|ò|ö|ô', 'o', 'g');
  base_slug := regexp_replace(base_slug, 'ú|ù|ü|û', 'u', 'g');
  base_slug := regexp_replace(base_slug, 'ñ', 'n', 'g');
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  while exists (select 1 from public.shops where slug = final_slug) loop
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;
  return final_slug;
end;
$$;

create or replace function public.set_shop_slug()
returns trigger
language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_shop_slug(new.nombre);
  end if;
  return new;
end;
$$;

create or replace function public.check_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  owner_count int;
begin
  select count(*) into owner_count
  from public.user_profiles
  where shop_id = coalesce(old.shop_id, new.shop_id)
    and role = 'owner'
    and is_active = true;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.is_active = true and owner_count <= 1 then
      raise exception 'No podes eliminar al unico administrador. Cede el rol de Owner a otro usuario primero.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner'
       and old.is_active = true
       and owner_count <= 1
       and (new.role <> 'owner' or new.is_active = false) then
      raise exception 'No podes eliminar al unico administrador. Cede el rol de Owner a otro usuario primero.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.update_industry_config_timestamp()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.admin_mark_partner_commissions_paid(
  p_partner_id uuid,
  p_actor_user_id uuid
)
returns table(updated_count integer, total_amount numeric, payout_id uuid)
language plpgsql
security definer
set search_path = public as $$
declare
  v_total numeric(12,2) := 0;
  v_count integer := 0;
  v_payout_id uuid;
begin
  with locked_rows as (
    select id, commission_amount
    from public.referral_commission_ledger
    where partner_id = p_partner_id and status = 'pending'
    for update
  ),
  stats as (
    select coalesce(sum(commission_amount), 0)::numeric(12,2) as total,
           count(*)::integer as cnt
    from locked_rows
  )
  select total, cnt into v_total, v_count from stats;

  if v_count = 0 then
    return query select 0::integer, 0::numeric, null::uuid;
    return;
  end if;

  insert into public.referral_commission_payouts (partner_id, paid_at, amount, status, created_by, created_at, updated_at)
  values (p_partner_id, now(), v_total, 'paid', p_actor_user_id, now(), now())
  returning id into v_payout_id;

  update public.referral_commission_ledger
  set status = 'paid', paid_at = now(), payout_id = v_payout_id, updated_at = now()
  where partner_id = p_partner_id and status = 'pending';

  return query select v_count, v_total, v_payout_id;
end;
$$;

-- ============================================================
-- TABLAS
-- ============================================================

create table if not exists public.admin_allowlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  shop_id    uuid not null,
  role       text not null default 'admin',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action        text not null,
  target_type   text,
  target_id     text,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.appointments (
  id                               uuid primary key default gen_random_uuid(),
  shop_id                          uuid not null,
  customer_id                      uuid,
  staff_id                         uuid,
  service_id                       uuid,
  start_time                       timestamptz not null,
  end_time                         timestamptz not null,
  status                           text default 'scheduled',
  notes                            text,
  is_paid                          boolean default false,
  date_key_ar                      text,
  mp_preference_id                 text,
  created_at                       timestamptz default now(),
  updated_at                       timestamptz default now(),
  deposit_amount                   numeric,
  loyalty_reward_applied           boolean not null default false,
  loyalty_discount_percent_applied integer not null default 0,
  constraint check_times check (end_time > start_time),
  constraint appointments_status_check check (status in ('scheduled', 'completed', 'cancelled', 'no_show'))
);

create table if not exists public.cash_movements (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null,
  cash_session_id uuid,
  appointment_id  uuid,
  created_by      uuid,
  movement_type   text not null,
  amount          numeric not null,
  payment_method  text not null,
  category        text not null,
  description     text,
  happened_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.cash_sessions (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null,
  opened_by        uuid not null,
  opened_at        timestamptz not null default now(),
  opening_amount   numeric not null default 0,
  status           text not null default 'open',
  closed_by        uuid,
  closed_at        timestamptz,
  expected_amount  numeric,
  counted_amount   numeric,
  difference_amount numeric,
  close_notes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.customers (
  id                        uuid primary key default gen_random_uuid(),
  shop_id                   uuid not null,
  user_id                   uuid,
  nombre                    text not null,
  email                     text,
  telefono                  text,
  cumpleaños                text,
  localidad                 text,
  observaciones_tecnicas    text,
  es_vip                    boolean default false,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  recurring_weekday         smallint,
  recurring_frequency       text,
  recurring_notes           text,
  loyalty_cuts_count        integer not null default 0,
  loyalty_rewards_available integer not null default 0
);

create table if not exists public.email_verifications (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code        text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  verified_at timestamptz
);

create table if not exists public.finances (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null,
  appointment_id  uuid,
  amount          numeric not null,
  type            text not null,
  category        text not null,
  description     text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists public.industry_config (
  industry   text not null primary key,
  features   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.leads_global (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid,
  nombre     text not null,
  email      text,
  telefono   text,
  origen     text,
  estado     text default 'nuevo',
  created_at timestamptz default now()
);

create table if not exists public.mercadopago_logs (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid,
  appointment_id    uuid,
  mp_preference_id  text,
  event_type        text not null,
  payload           jsonb default '{}'::jsonb,
  created_at        timestamptz default now()
);

create table if not exists public.pending_bookings (
  id                     uuid primary key default gen_random_uuid(),
  shop_id                uuid not null,
  service_id             uuid not null,
  staff_id               uuid,
  customer_name          text not null,
  customer_email         text,
  customer_phone         text not null,
  authenticated_user_id  uuid,
  start_time             timestamptz not null,
  end_time               timestamptz not null,
  deposit_amount         numeric,
  mp_preference_id       text,
  status                 text not null default 'pending',
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null default (now() + interval '15 minutes')
);

create table if not exists public.product_event_markers (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null,
  marker_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.product_events (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null,
  event_type    text not null,
  actor_user_id uuid,
  metadata      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table if not exists public.referral_attributions (
  id                         uuid primary key default gen_random_uuid(),
  shop_id                    uuid not null,
  partner_id                 uuid not null,
  attributed_at              timestamptz not null default now(),
  referral_code_snapshot     text,
  commission_percent_snapshot numeric not null,
  commission_months_snapshot integer not null,
  created_at                 timestamptz not null default now()
);

create table if not exists public.referral_commission_ledger (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null,
  shop_id            uuid not null,
  billing_event_id   uuid not null,
  payment_id         text,
  payment_applied_at timestamptz not null,
  payment_sequence   integer not null,
  period_ym          text not null,
  base_amount        numeric not null,
  commission_percent numeric not null,
  commission_amount  numeric not null,
  status             text not null default 'pending',
  payout_id          uuid,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.referral_commission_payouts (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null,
  paid_at    timestamptz,
  amount     numeric not null default 0,
  currency   text not null default 'ARS',
  status     text not null default 'pending',
  notes      text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_partners (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  email                       text,
  phone                       text,
  referral_code               text not null,
  commission_percent_override numeric,
  commission_months_override  integer,
  is_active                   boolean not null default true,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists public.referral_program_settings (
  id                         uuid primary key default gen_random_uuid(),
  is_default                 boolean not null default true,
  default_commission_percent numeric not null default 20,
  default_commission_months  integer not null default 2,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null,
  name             text not null,
  price            numeric not null default 0,
  duration_minutes integer default 30,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  category         text not null default 'General',
  constraint services_price_check check (price >= 0),
  constraint services_duration_minutes_check check (duration_minutes > 0)
);

create table if not exists public.shop_billing_events (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null,
  actor_user_id uuid,
  event_type    text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.shop_booking_theme (
  shop_id               uuid not null primary key,
  template_id           text not null default 'minimal-glass',
  logo_url              text,
  logo_storage_path     text,
  hero_title            text,
  hero_subtitle         text,
  about_title           text,
  about_text            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  section_order         text[] not null default array['General'::text],
  section_service_order text[] not null default array[]::text[]
);

create table if not exists public.shop_memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  shop_id    uuid not null,
  role       text not null default 'staff',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_memberships_role_check check (role in ('owner', 'admin', 'staff')),
  constraint shop_memberships_user_id_shop_id_key unique (user_id, shop_id)
);

create table if not exists public.shops (
  id                        uuid primary key default gen_random_uuid(),
  nombre                    text not null,
  slug                      text not null,
  description               text,
  address                   text,
  localidad                 text,
  phone                     text,
  instagram_url             text,
  google_maps_url           text,
  business_hours            jsonb default '{}'::jsonb,
  active                    boolean default true,
  plan_expiry               timestamptz,
  mp_public_key             text,
  mp_access_token           text,
  whatsapp_template         text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  facebook_url              text,
  tiktok_url                text,
  voucher_whatsapp_template text,
  loyalty_enabled           boolean not null default true,
  loyalty_cuts_required     integer not null default 10,
  loyalty_discount_percent  integer not null default 10,
  booking_deposit_enabled   boolean not null default true,
  booking_deposit_amount    numeric not null default 5000,
  industry                  text not null default 'peluqueria',
  features_override         jsonb,
  constraint shops_slug_key unique (slug)
);

create table if not exists public.staff_commission_overrides (
  id                   uuid primary key default gen_random_uuid(),
  shop_id              uuid not null,
  compensation_rule_id uuid not null,
  service_id           uuid not null,
  percentage_rate      numeric not null,
  fixed_amount         numeric,
  created_at           timestamptz not null default now(),
  constraint staff_commission_overrides_compensation_rule_id_service_id_key unique (compensation_rule_id, service_id)
);

create table if not exists public.staff_compensation_rules (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null,
  staff_user_id    uuid not null,
  model            text not null,
  percentage_rate  numeric,
  fixed_amount     numeric,
  starts_on        date not null,
  ends_on          date,
  is_active        boolean not null default true,
  notes            text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint staff_compensation_rules_model_check check (model in ('percentage', 'fixed', 'hybrid')),
  constraint staff_compensation_rules_check check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.staff_liquidation_items (
  id                      uuid primary key default gen_random_uuid(),
  shop_id                 uuid not null,
  liquidation_id          uuid not null,
  appointment_id          uuid,
  service_id              uuid,
  service_name_snapshot   text,
  start_time_snapshot     timestamptz,
  gross_amount            numeric not null default 0,
  commission_rate_snapshot numeric,
  commission_amount       numeric not null default 0,
  bonus_amount            numeric not null default 0,
  deduction_amount        numeric not null default 0,
  net_amount              numeric not null default 0,
  created_at              timestamptz not null default now()
);

create table if not exists public.staff_liquidations (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null,
  staff_user_id      uuid not null,
  period_start       date not null,
  period_end         date not null,
  status             text not null default 'draft',
  gross_revenue      numeric not null default 0,
  commission_amount  numeric not null default 0,
  bonuses_amount     numeric not null default 0,
  deductions_amount  numeric not null default 0,
  final_payable      numeric not null default 0,
  paid_amount        numeric not null default 0,
  paid_at            timestamptz,
  paid_by            uuid,
  notes              text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint staff_liquidations_status_check check (status in ('draft', 'confirmed', 'paid', 'cancelled')),
  constraint staff_liquidations_check check (period_end >= period_start)
);

create table if not exists public.stock (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null,
  nombre_producto text not null,
  quantity        integer default 0,
  unit_cost       numeric default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint stock_quantity_check check (quantity >= 0),
  constraint stock_unit_cost_check check (unit_cost >= 0)
);

create table if not exists public.user_profiles (
  user_id       uuid not null primary key,
  shop_id       uuid,
  name          text,
  nombre        text,
  email         text,
  role          text default 'staff',
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  platform_role text not null default 'user',
  constraint user_profiles_platform_role_check check (platform_role in ('user', 'super_admin'))
);

create table if not exists public.vouchers (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null,
  customer_id       uuid,
  gifted_to_name    text not null,
  gifted_to_phone   text,
  gifted_to_birthday date not null,
  gifted_by_name    text,
  service_name      text not null,
  voucher_message   text,
  status            text not null default 'pending',
  reminder_sent_at  timestamptz,
  redeemed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_allowlist_shop_id_fkey') then
    alter table only public.admin_allowlist add constraint admin_allowlist_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointments_shop_id_fkey') then
    alter table only public.appointments add constraint appointments_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_staff_id_fkey') then
    alter table only public.appointments add constraint appointments_staff_id_fkey foreign key (staff_id) references public.user_profiles(user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_service_id_fkey') then
    alter table only public.appointments add constraint appointments_service_id_fkey foreign key (service_id) references public.services(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_customer_id_fkey') then
    alter table only public.appointments add constraint appointments_customer_id_fkey foreign key (customer_id) references public.customers(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cash_movements_shop_id_fkey') then
    alter table only public.cash_movements add constraint cash_movements_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_movements_cash_session_id_fkey') then
    alter table only public.cash_movements add constraint cash_movements_cash_session_id_fkey foreign key (cash_session_id) references public.cash_sessions(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_movements_appointment_id_fkey') then
    alter table only public.cash_movements add constraint cash_movements_appointment_id_fkey foreign key (appointment_id) references public.appointments(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cash_sessions_shop_id_fkey') then
    alter table only public.cash_sessions add constraint cash_sessions_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'customers_shop_id_fkey') then
    alter table only public.customers add constraint customers_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'finances_shop_id_fkey') then
    alter table only public.finances add constraint finances_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finances_appointment_id_fkey') then
    alter table only public.finances add constraint finances_appointment_id_fkey foreign key (appointment_id) references public.appointments(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_global_shop_id_fkey') then
    alter table only public.leads_global add constraint leads_global_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mercadopago_logs_appointment_id_fkey') then
    alter table only public.mercadopago_logs add constraint mercadopago_logs_appointment_id_fkey foreign key (appointment_id) references public.appointments(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'pending_bookings_shop_id_fkey') then
    alter table only public.pending_bookings add constraint pending_bookings_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'product_event_markers_shop_id_fkey') then
    alter table only public.product_event_markers add constraint product_event_markers_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'product_events_shop_id_fkey') then
    alter table only public.product_events add constraint product_events_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'referral_attributions_shop_id_fkey') then
    alter table only public.referral_attributions add constraint referral_attributions_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'referral_attributions_partner_id_fkey') then
    alter table only public.referral_attributions add constraint referral_attributions_partner_id_fkey foreign key (partner_id) references public.referral_partners(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'referral_commission_ledger_partner_id_fkey') then
    alter table only public.referral_commission_ledger add constraint referral_commission_ledger_partner_id_fkey foreign key (partner_id) references public.referral_partners(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'referral_commission_ledger_shop_id_fkey') then
    alter table only public.referral_commission_ledger add constraint referral_commission_ledger_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'referral_commission_ledger_billing_event_id_fkey') then
    alter table only public.referral_commission_ledger add constraint referral_commission_ledger_billing_event_id_fkey foreign key (billing_event_id) references public.shop_billing_events(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'referral_commission_ledger_payout_id_fkey') then
    alter table only public.referral_commission_ledger add constraint referral_commission_ledger_payout_id_fkey foreign key (payout_id) references public.referral_commission_payouts(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'referral_commission_payouts_partner_id_fkey') then
    alter table only public.referral_commission_payouts add constraint referral_commission_payouts_partner_id_fkey foreign key (partner_id) references public.referral_partners(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'services_shop_id_fkey') then
    alter table only public.services add constraint services_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shop_billing_events_shop_id_fkey') then
    alter table only public.shop_billing_events add constraint shop_billing_events_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shop_booking_theme_shop_id_fkey') then
    alter table only public.shop_booking_theme add constraint shop_booking_theme_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shop_memberships_shop_id_fkey') then
    alter table only public.shop_memberships add constraint shop_memberships_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'staff_commission_overrides_shop_id_fkey') then
    alter table only public.staff_commission_overrides add constraint staff_commission_overrides_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_commission_overrides_compensation_rule_id_fkey') then
    alter table only public.staff_commission_overrides add constraint staff_commission_overrides_compensation_rule_id_fkey foreign key (compensation_rule_id) references public.staff_compensation_rules(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_commission_overrides_service_id_fkey') then
    alter table only public.staff_commission_overrides add constraint staff_commission_overrides_service_id_fkey foreign key (service_id) references public.services(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'staff_compensation_rules_shop_id_fkey') then
    alter table only public.staff_compensation_rules add constraint staff_compensation_rules_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'staff_liquidation_items_shop_id_fkey') then
    alter table only public.staff_liquidation_items add constraint staff_liquidation_items_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_liquidation_items_liquidation_id_fkey') then
    alter table only public.staff_liquidation_items add constraint staff_liquidation_items_liquidation_id_fkey foreign key (liquidation_id) references public.staff_liquidations(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_liquidation_items_appointment_id_fkey') then
    alter table only public.staff_liquidation_items add constraint staff_liquidation_items_appointment_id_fkey foreign key (appointment_id) references public.appointments(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_liquidation_items_service_id_fkey') then
    alter table only public.staff_liquidation_items add constraint staff_liquidation_items_service_id_fkey foreign key (service_id) references public.services(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'staff_liquidations_shop_id_fkey') then
    alter table only public.staff_liquidations add constraint staff_liquidations_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'stock_shop_id_fkey') then
    alter table only public.stock add constraint stock_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_profiles_shop_id_fkey') then
    alter table only public.user_profiles add constraint user_profiles_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vouchers_shop_id_fkey') then
    alter table only public.vouchers add constraint vouchers_shop_id_fkey foreign key (shop_id) references public.shops(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vouchers_customer_id_fkey') then
    alter table only public.vouchers add constraint vouchers_customer_id_fkey foreign key (customer_id) references public.customers(id);
  end if;
end $$;

-- ============================================================
-- ÍNDICES ADICIONALES
-- ============================================================

create index if not exists idx_admin_allowlist_shop_id on public.admin_allowlist (shop_id);
create index if not exists idx_admin_audit_logs_actor on public.admin_audit_logs (actor_user_id);
create index if not exists idx_admin_audit_logs_created_at on public.admin_audit_logs (created_at desc);
create index if not exists idx_appointments_customer_id on public.appointments(customer_id);
create index if not exists idx_appointments_staff_id on public.appointments(staff_id);
create index if not exists idx_appointments_service_id on public.appointments(service_id);
create index if not exists idx_appointments_start_time on public.appointments(start_time);
create index if not exists idx_appointments_shop_id on public.appointments(shop_id);
create index if not exists idx_appointments_shop_start_status on public.appointments(shop_id, start_time, status);
create unique index if not exists idx_cash_sessions_single_open on public.cash_sessions (shop_id) where status = 'open';
create index if not exists idx_cash_sessions_shop_opened_at on public.cash_sessions (shop_id, opened_at desc);
create index if not exists idx_cash_movements_shop_happened_at on public.cash_movements (shop_id, happened_at desc);
create index if not exists idx_cash_movements_session on public.cash_movements (cash_session_id);
create index if not exists idx_customers_shop_id on public.customers(shop_id);
create index if not exists idx_customers_shop_phone on public.customers(shop_id, telefono);
create index if not exists idx_customers_loyalty_rewards_available on public.customers(shop_id, loyalty_rewards_available);
create index if not exists email_verifications_email_idx on public.email_verifications (email);
create index if not exists email_verifications_code_idx on public.email_verifications (code);
create index if not exists idx_finances_shop_id on public.finances(shop_id);
create index if not exists idx_finances_created_at on public.finances(created_at);
create index if not exists idx_leads_email on public.leads_global(email);
create index if not exists idx_leads_shop_id on public.leads_global(shop_id);
create index if not exists idx_pending_bookings_shop_time on public.pending_bookings (shop_id, start_time, end_time);
create index if not exists idx_pending_bookings_status on public.pending_bookings (status, expires_at);
create unique index if not exists idx_pending_bookings_unique_slot on public.pending_bookings (shop_id, staff_id, start_time) where status = 'pending';
create index if not exists idx_product_events_shop_occurred on public.product_events (shop_id, occurred_at desc);
create index if not exists idx_product_events_type_occurred on public.product_events (event_type, occurred_at desc);
create index if not exists idx_referral_attributions_partner on public.referral_attributions (partner_id, attributed_at desc);
create index if not exists idx_referral_commission_ledger_partner_status on public.referral_commission_ledger (partner_id, status, payment_applied_at desc);
create index if not exists idx_referral_commission_ledger_shop on public.referral_commission_ledger (shop_id, payment_applied_at desc);
create index if not exists idx_referral_commission_payouts_partner on public.referral_commission_payouts (partner_id, created_at desc);
create unique index if not exists uq_referral_program_settings_default on public.referral_program_settings (is_default) where is_default = true;
create unique index if not exists uq_referral_partners_code on public.referral_partners (lower(referral_code));
create index if not exists idx_services_shop_category_name on public.services(shop_id, category, name);
create index if not exists idx_shop_billing_events_shop_id on public.shop_billing_events(shop_id);
create index if not exists idx_shop_billing_events_created_at on public.shop_billing_events(created_at desc);
create unique index if not exists uq_shop_billing_events_appt_applied_payment_id on public.shop_billing_events ((payload->>'payment_id')) where event_type = 'appointment_payment_applied' and coalesce(payload->>'payment_id', '') <> '';
create unique index if not exists uq_shop_billing_events_sub_applied_payment_id on public.shop_billing_events ((payload->>'payment_id')) where event_type = 'subscription_payment_applied' and coalesce(payload->>'payment_id', '') <> '';
create index if not exists idx_shop_billing_events_appt_applied_shop_id on public.shop_billing_events (shop_id, created_at desc) where event_type = 'appointment_payment_applied';
create index if not exists idx_shop_billing_events_sub_webhook_payment_id on public.shop_billing_events ((payload->>'payment_id')) where event_type = 'subscription_payment_webhook';
create index if not exists idx_shop_booking_theme_template_id on public.shop_booking_theme(template_id);
create index if not exists idx_shop_memberships_user_id on public.shop_memberships(user_id);
create index if not exists idx_shop_memberships_shop_id on public.shop_memberships(shop_id);
create index if not exists idx_shop_memberships_user_active on public.shop_memberships(user_id, is_active);
create index if not exists shops_industry_idx on public.shops (industry);
create unique index if not exists idx_staff_comp_rules_unique_open on public.staff_compensation_rules (shop_id, staff_user_id) where ends_on is null and is_active = true;
create index if not exists idx_staff_comp_rules_shop_staff_dates on public.staff_compensation_rules (shop_id, staff_user_id, starts_on, ends_on);
create index if not exists idx_staff_commission_overrides_shop on public.staff_commission_overrides (shop_id);
create unique index if not exists idx_staff_liquidations_unique_period on public.staff_liquidations (shop_id, staff_user_id, period_start, period_end) where status <> 'cancelled';
create index if not exists idx_staff_liquidations_shop_status on public.staff_liquidations (shop_id, status, period_start desc);
create unique index if not exists idx_staff_liquidation_items_unique_appointment on public.staff_liquidation_items (liquidation_id, appointment_id) where appointment_id is not null;
create index if not exists idx_staff_liquidation_items_shop on public.staff_liquidation_items (shop_id, liquidation_id);
create index if not exists idx_stock_shop_id on public.stock(shop_id);
create index if not exists idx_stock_shop_quantity on public.stock(shop_id, quantity);
create index if not exists idx_user_profiles_shop_id on public.user_profiles(shop_id);
create index if not exists idx_user_profiles_platform_role on public.user_profiles (platform_role);
create index if not exists idx_vouchers_shop_id on public.vouchers(shop_id);
create index if not exists idx_vouchers_birthday on public.vouchers(gifted_to_birthday);
create index if not exists idx_vouchers_status on public.vouchers(status);
create unique index if not exists idx_leads_global_email_shop on public.leads_global (email, shop_id) where email is not null;

-- ============================================================
-- TRIGGERS
-- ============================================================

drop trigger if exists trg_shops_updated_at on public.shops;
create trigger trg_shops_updated_at before update on public.shops
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at before update on public.services
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at before update on public.appointments
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_stock_updated_at on public.stock;
create trigger trg_stock_updated_at before update on public.stock
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_shop_memberships_updated_at on public.shop_memberships;
create trigger trg_shop_memberships_updated_at before update on public.shop_memberships
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_shop_booking_theme_updated_at on public.shop_booking_theme;
create trigger trg_shop_booking_theme_updated_at before update on public.shop_booking_theme
  for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_update_industry_config_timestamp on public.industry_config;
create trigger trg_update_industry_config_timestamp before update on public.industry_config
  for each row execute function public.update_industry_config_timestamp();

drop trigger if exists trigger_check_last_owner on public.user_profiles;
create trigger trigger_check_last_owner before update or delete on public.user_profiles
  for each row execute function public.check_last_owner();

drop trigger if exists trigger_set_shop_slug on public.shops;
create trigger trigger_set_shop_slug before insert on public.shops
  for each row execute function public.set_shop_slug();

-- ============================================================
-- RLS
-- ============================================================

alter table if exists public.admin_allowlist enable row level security;
alter table if exists public.admin_audit_logs enable row level security;
alter table if exists public.appointments enable row level security;
alter table if exists public.cash_movements enable row level security;
alter table if exists public.cash_sessions enable row level security;
alter table if exists public.customers enable row level security;
alter table if exists public.email_verifications enable row level security;
alter table if exists public.finances enable row level security;
alter table if exists public.industry_config enable row level security;
alter table if exists public.leads_global enable row level security;
alter table if exists public.mercadopago_logs enable row level security;
alter table if exists public.pending_bookings enable row level security;
alter table if exists public.product_event_markers enable row level security;
alter table if exists public.product_events enable row level security;
alter table if exists public.referral_attributions enable row level security;
alter table if exists public.referral_commission_ledger enable row level security;
alter table if exists public.referral_commission_payouts enable row level security;
alter table if exists public.referral_partners enable row level security;
alter table if exists public.referral_program_settings enable row level security;
alter table if exists public.services enable row level security;
alter table if exists public.shop_billing_events enable row level security;
alter table if exists public.shop_booking_theme enable row level security;
alter table if exists public.shop_memberships enable row level security;
alter table if exists public.shops enable row level security;
alter table if exists public.staff_commission_overrides enable row level security;
alter table if exists public.staff_compensation_rules enable row level security;
alter table if exists public.staff_liquidation_items enable row level security;
alter table if exists public.staff_liquidations enable row level security;
alter table if exists public.stock enable row level security;
alter table if exists public.user_profiles enable row level security;
alter table if exists public.vouchers enable row level security;

-- ============================================================
-- POLÍTICAS RLS
-- ============================================================

drop policy if exists "admin_audit_logs_no_direct_access" on public.admin_audit_logs;
create policy "admin_audit_logs_no_direct_access" on public.admin_audit_logs
  as permissive for all to authenticated using (false) with check (false);

drop policy if exists "RLS_MultiLocal_v2_Strict" on public.appointments;
create policy "RLS_MultiLocal_v2_Strict" on public.appointments
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = appointments.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = appointments.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ));

drop policy if exists "cash_movements_manage" on public.cash_movements;
create policy "cash_movements_manage" on public.cash_movements
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = cash_movements.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = cash_movements.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "cash_movements_select" on public.cash_movements;
create policy "cash_movements_select" on public.cash_movements
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = cash_movements.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "cash_sessions_manage" on public.cash_sessions;
create policy "cash_sessions_manage" on public.cash_sessions
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = cash_sessions.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = cash_sessions.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "cash_sessions_select" on public.cash_sessions;
create policy "cash_sessions_select" on public.cash_sessions
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = cash_sessions.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "RLS_MultiLocal_v2_Strict" on public.customers;
create policy "RLS_MultiLocal_v2_Strict" on public.customers
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = customers.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = customers.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ));

drop policy if exists "email_verifications_insert_all" on public.email_verifications;
create policy "email_verifications_insert_all" on public.email_verifications
  as permissive for insert to authenticated
  with check (email = (auth.jwt() ->> 'email'::text));

drop policy if exists "email_verifications_select_own" on public.email_verifications;
create policy "email_verifications_select_own" on public.email_verifications
  as permissive for select to authenticated
  using (email = (auth.jwt() ->> 'email'::text));

drop policy if exists "email_verifications_update_own" on public.email_verifications;
create policy "email_verifications_update_own" on public.email_verifications
  as permissive for update to authenticated
  using (email = (auth.jwt() ->> 'email'::text))
  with check (email = (auth.jwt() ->> 'email'::text));

drop policy if exists "RLS_MultiLocal_v2_Strict" on public.finances;
create policy "RLS_MultiLocal_v2_Strict" on public.finances
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = finances.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = finances.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ));

drop policy if exists "Admins pueden actualizar industry_config" on public.industry_config;
create policy "Admins pueden actualizar industry_config" on public.industry_config
  as permissive for update to public
  using (exists (
    select 1 from public.user_profiles where user_profiles.user_id = auth.uid() and user_profiles.role = 'super_admin'::text
  ))
  with check (exists (
    select 1 from public.user_profiles where user_profiles.user_id = auth.uid() and user_profiles.role = 'super_admin'::text
  ));

drop policy if exists "Admins pueden leer industry_config" on public.industry_config;
create policy "Admins pueden leer industry_config" on public.industry_config
  as permissive for select to public
  using (exists (
    select 1 from public.user_profiles where user_profiles.user_id = auth.uid() and user_profiles.role = 'super_admin'::text
  ));

drop policy if exists "Leads public insert" on public.leads_global;
create policy "Leads public insert" on public.leads_global
  as permissive for insert to anon
  with check (shop_id in (select shops.id from public.shops where shops.active = true));

drop policy if exists "leads_delete_admin" on public.leads_global;
create policy "leads_delete_admin" on public.leads_global
  as permissive for delete to authenticated
  using (shop_id = public.current_user_shop_id());

drop policy if exists "leads_insert_public" on public.leads_global;
create policy "leads_insert_public" on public.leads_global
  as permissive for insert to anon
  with check (public.is_active_shop(shop_id));

drop policy if exists "leads_select_admin" on public.leads_global;
create policy "leads_select_admin" on public.leads_global
  as permissive for select to authenticated
  using (shop_id = public.current_user_shop_id());

drop policy if exists "leads_update_admin" on public.leads_global;
create policy "leads_update_admin" on public.leads_global
  as permissive for update to authenticated
  using (shop_id = public.current_user_shop_id())
  with check (shop_id = public.current_user_shop_id());

drop policy if exists "RLS_Isolation_By_Function" on public.mercadopago_logs;
create policy "RLS_Isolation_By_Function" on public.mercadopago_logs
  as permissive for all to authenticated
  using (shop_id = public.current_user_shop_id())
  with check (shop_id = public.current_user_shop_id());

drop policy if exists "pending_bookings_delete_shop" on public.pending_bookings;
create policy "pending_bookings_delete_shop" on public.pending_bookings
  as permissive for delete to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = pending_bookings.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "pending_bookings_insert_anon" on public.pending_bookings;
create policy "pending_bookings_insert_anon" on public.pending_bookings
  as permissive for insert to anon
  with check (true);

drop policy if exists "pending_bookings_select_own" on public.pending_bookings;
create policy "pending_bookings_select_own" on public.pending_bookings
  as permissive for select to anon using (true);

drop policy if exists "pending_bookings_select_shop" on public.pending_bookings;
create policy "pending_bookings_select_shop" on public.pending_bookings
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = pending_bookings.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "service_role_all_product_event_markers" on public.product_event_markers;
create policy "service_role_all_product_event_markers" on public.product_event_markers
  as permissive for all to public
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

drop policy if exists "service_role_all_product_events" on public.product_events;
create policy "service_role_all_product_events" on public.product_events
  as permissive for all to public
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

drop policy if exists "referral_attributions_no_direct_access" on public.referral_attributions;
create policy "referral_attributions_no_direct_access" on public.referral_attributions
  as permissive for all to authenticated using (false) with check (false);

drop policy if exists "referral_commission_ledger_no_direct_access" on public.referral_commission_ledger;
create policy "referral_commission_ledger_no_direct_access" on public.referral_commission_ledger
  as permissive for all to authenticated using (false) with check (false);

drop policy if exists "referral_commission_payouts_no_direct_access" on public.referral_commission_payouts;
create policy "referral_commission_payouts_no_direct_access" on public.referral_commission_payouts
  as permissive for all to authenticated using (false) with check (false);

drop policy if exists "referral_partners_no_direct_access" on public.referral_partners;
create policy "referral_partners_no_direct_access" on public.referral_partners
  as permissive for all to authenticated using (false) with check (false);

drop policy if exists "referral_program_settings_no_direct_access" on public.referral_program_settings;
create policy "referral_program_settings_no_direct_access" on public.referral_program_settings
  as permissive for all to authenticated using (false) with check (false);

drop policy if exists "RLS_MultiLocal_v2_Strict" on public.services;
create policy "RLS_MultiLocal_v2_Strict" on public.services
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = services.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = services.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ));

drop policy if exists "shop_billing_events_select_member" on public.shop_billing_events;
create policy "shop_billing_events_select_member" on public.shop_billing_events
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.user_id = auth.uid() and sm.shop_id = shop_billing_events.shop_id and sm.is_active = true
  ));

drop policy if exists "shop_booking_theme_insert_admin" on public.shop_booking_theme;
create policy "shop_booking_theme_insert_admin" on public.shop_booking_theme
  as permissive for insert to authenticated
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "shop_booking_theme_select_members" on public.shop_booking_theme;
create policy "shop_booking_theme_select_members" on public.shop_booking_theme
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "shop_booking_theme_update_admin" on public.shop_booking_theme;
create policy "shop_booking_theme_update_admin" on public.shop_booking_theme
  as permissive for update to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "shop_memberships_select_own" on public.shop_memberships;
create policy "shop_memberships_select_own" on public.shop_memberships
  as permissive for select to authenticated using (user_id = auth.uid());

drop policy if exists "shops_membership_access" on public.shops;
create policy "shops_membership_access" on public.shops
  as permissive for all to authenticated
  using (id = public.current_user_shop_id())
  with check (id = public.current_user_shop_id());

drop policy if exists "shops_select_own" on public.shops;
create policy "shops_select_own" on public.shops
  as permissive for select to authenticated using (id = public.current_user_shop_id());

drop policy if exists "shops_update_own" on public.shops;
create policy "shops_update_own" on public.shops
  as permissive for update to authenticated
  using (id = public.current_user_shop_id())
  with check (id = public.current_user_shop_id());

drop policy if exists "staff_commission_overrides_manage" on public.staff_commission_overrides;
create policy "staff_commission_overrides_manage" on public.staff_commission_overrides
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_commission_overrides.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_commission_overrides.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "staff_commission_overrides_select" on public.staff_commission_overrides;
create policy "staff_commission_overrides_select" on public.staff_commission_overrides
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_commission_overrides.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "staff_comp_rules_manage" on public.staff_compensation_rules;
create policy "staff_comp_rules_manage" on public.staff_compensation_rules
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_compensation_rules.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_compensation_rules.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "staff_comp_rules_select" on public.staff_compensation_rules;
create policy "staff_comp_rules_select" on public.staff_compensation_rules
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_compensation_rules.shop_id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "staff_liquidation_items_manage" on public.staff_liquidation_items;
create policy "staff_liquidation_items_manage" on public.staff_liquidation_items
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_liquidation_items.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_liquidation_items.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "staff_liquidation_items_select" on public.staff_liquidation_items;
create policy "staff_liquidation_items_select" on public.staff_liquidation_items
  as permissive for select to authenticated
  using (exists (
    select 1 from public.staff_liquidations sl
    where sl.id = staff_liquidation_items.liquidation_id
      and sl.shop_id = staff_liquidation_items.shop_id
      and (
        sl.staff_user_id = auth.uid()
        or exists (
          select 1 from public.shop_memberships sm
          where sm.shop_id = sl.shop_id and sm.user_id = auth.uid() and sm.is_active = true
            and sm.role = any (array['owner'::text, 'admin'::text])
        )
      )
  ));

drop policy if exists "staff_liquidations_manage" on public.staff_liquidations;
create policy "staff_liquidations_manage" on public.staff_liquidations
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_liquidations.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = staff_liquidations.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "staff_liquidations_select" on public.staff_liquidations;
create policy "staff_liquidations_select" on public.staff_liquidations
  as permissive for select to authenticated
  using (
    (exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = staff_liquidations.shop_id and sm.user_id = auth.uid() and sm.is_active = true
    ))
    and (
      staff_user_id = auth.uid()
      or exists (
        select 1 from public.shop_memberships sm2
        where sm2.shop_id = staff_liquidations.shop_id and sm2.user_id = auth.uid() and sm2.is_active = true
          and sm2.role = any (array['owner'::text, 'admin'::text])
      )
    )
  );

drop policy if exists "RLS_MultiLocal_v2_Strict" on public.stock;
create policy "RLS_MultiLocal_v2_Strict" on public.stock
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = stock.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = stock.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ));

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles
  as permissive for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_profiles_own_access" on public.user_profiles;
create policy "user_profiles_own_access" on public.user_profiles
  as permissive for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
  as permissive for select to authenticated using (user_id = auth.uid());

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  as permissive for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "RLS_MultiLocal_v2_Strict" on public.vouchers;
create policy "RLS_MultiLocal_v2_Strict" on public.vouchers
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = vouchers.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = vouchers.shop_id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ));
