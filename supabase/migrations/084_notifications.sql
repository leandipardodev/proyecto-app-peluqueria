-- 084_notifications.sql
-- Notificaciones del dashboard (feed estilo IG/FB) con estado de lectura server-side.
-- - Eventos reales se generan con triggers sobre las tablas de negocio.
-- - Notificaciones "de estado" (recompensas, cumpleaños, plan, estacionales) se
--   "aseguran" desde la API de lectura (GET) usando entity_key con dedup.
-- - entity_key unico por (shop_id, entity_key) -> ningun evento duplica.

-- ============================================================
-- TABLAS
-- ============================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  type        text not null,
  category    text not null check (category in ('urgent', 'action', 'info')),
  title       text not null,
  description text not null,
  href        text not null default '',
  entity_key  text not null,
  payload     jsonb,
  created_at  timestamptz not null default now(),
  constraint notifications_shop_entity_unique unique (shop_id, entity_key)
);

create index if not exists idx_notifications_shop_created
  on public.notifications (shop_id, created_at desc);

create table if not exists public.notification_reads (
  user_id         uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (user_id, notification_id)
);

create index if not exists idx_notification_reads_user
  on public.notification_reads (user_id, read_at desc);

-- ============================================================
-- RLS
-- ============================================================

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

-- Lectura: solo miembros activos del local. Escritura queda restringida a
-- service role / funciones security definer (los triggers corren como definer).
drop policy if exists "notifications_select_members" on public.notifications;
create policy "notifications_select_members" on public.notifications
  as permissive for select to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = notifications.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text, 'staff'::text])
  ));

-- Read state: cada usuario solo sobre sus propias filas.
drop policy if exists "notification_reads_own" on public.notification_reads;
create policy "notification_reads_own" on public.notification_reads
  as permissive for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- FUNCIONES DE TRIGGER
-- ============================================================

create or replace function public.notify_appointment_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
begin
  if new.status not in ('scheduled', 'confirmed', 'pending_payment') then
    return new;
  end if;

  select c.nombre into v_customer_name
  from public.customers c
  where c.id = new.customer_id;

  insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
  values (
    new.shop_id,
    'nuevo_turno',
    'info',
    'Nuevo turno agendado',
    coalesce(v_customer_name, 'Un cliente')
      || ' tiene turno el '
      || to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
      || ' a las '
      || to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
    '/dashboard/calendar',
    'turno:' || new.id::text,
    coalesce(new.created_at, now())
  )
  on conflict (shop_id, entity_key) do nothing;

  return new;
end;
$$;

create or replace function public.notify_appointment_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  select c.nombre into v_customer_name
  from public.customers c
  where c.id = new.customer_id;

  insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
  values (
    new.shop_id,
    'turno_cancelado',
    'urgent',
    'Turno cancelado',
    coalesce(v_customer_name, 'Un cliente')
      || ' canceló su turno del '
      || to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
      || ' a las '
      || to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
    '/dashboard/calendar',
    'cancelado:' || new.id::text,
    now()
  )
  on conflict (shop_id, entity_key) do nothing;

  return new;
end;
$$;

create or replace function public.notify_order_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending_payment' then
    return new;
  end if;

  insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
  values (
    new.shop_id,
    'nuevo_pedido',
    'action',
    'Nuevo pedido de tienda',
    'Pedido de '
      || new.customer_name
      || ' por $'
      || trim(to_char(coalesce(new.total_amount, 0), 'FM999G999G999'))
      || ' esperando confirmación',
    '/dashboard/inventory?tab=orders',
    'pedido:' || new.id::text,
    coalesce(new.created_at, now())
  )
  on conflict (shop_id, entity_key) do nothing;

  return new;
end;
$$;

create or replace function public.notify_stock_level_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quantity < 5 then
    insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
    values (
      new.shop_id,
      'stock_bajo',
      'urgent',
      'Stock bajo',
      new.nombre_producto || ' tiene menos de 5 unidades disponibles',
      '/dashboard/inventory',
      'stock:' || new.id::text,
      coalesce(new.updated_at, now())
    )
    on conflict (shop_id, entity_key) do nothing;
  else
    delete from public.notifications n
    where n.shop_id = new.shop_id
      and n.entity_key = 'stock:' || new.id::text;
  end if;

  return new;
end;
$$;

create or replace function public.notify_stock_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications n
  where n.shop_id = old.shop_id
    and n.entity_key = 'stock:' || old.id::text;
  return old;
end;
$$;

create or replace function public.notify_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_role_label text;
begin
  if new.shop_id is null or coalesce(new.is_active, true) = false then
    return new;
  end if;

  if new.role not in ('owner', 'admin', 'staff') then
    return new;
  end if;

  v_member_name := coalesce(nullif(new.name, ''), nullif(new.nombre, ''), 'Nuevo miembro');
  v_role_label := case new.role
    when 'owner' then 'dueño'
    when 'admin' then 'administrador'
    else 'staff'
  end;

  insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
  values (
    new.shop_id,
    'nuevo_miembro',
    'info',
    'Nuevo miembro del equipo',
    v_member_name || ' se unió como ' || v_role_label,
    '/dashboard/staff',
    'miembro:' || new.user_id::text,
    coalesce(new.created_at, now())
  )
  on conflict (shop_id, entity_key) do nothing;

  return new;
end;
$$;

create or replace function public.notify_voucher_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'sent' then
    return new;
  end if;

  insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
  values (
    new.shop_id,
    'voucher_enviado',
    'action',
    'Voucher enviado',
    'Voucher de ' || new.service_name || ' enviado a ' || new.gifted_to_name,
    '/dashboard/fidelizacion',
    'voucher:' || new.id::text,
    coalesce(new.created_at, now())
  )
  on conflict (shop_id, entity_key) do nothing;

  return new;
end;
$$;

create or replace function public.notify_transfer_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_method <> 'bank_transfer' then
    return new;
  end if;

  insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
  values (
    new.shop_id,
    'transferencia_pendiente',
    'urgent',
    'Transferencia pendiente',
    new.customer_name
      || ' eligió transferencia bancaria para el '
      || to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
      || ' a las '
      || to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
    '/dashboard/bank-transfers',
    'transferencia:' || new.id::text,
    coalesce(new.created_at, now())
  )
  on conflict (shop_id, entity_key) do nothing;

  return new;
end;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

drop trigger if exists trg_notify_appointment_inserted on public.appointments;
create trigger trg_notify_appointment_inserted
  after insert on public.appointments
  for each row execute function public.notify_appointment_inserted();

drop trigger if exists trg_notify_appointment_cancelled on public.appointments;
create trigger trg_notify_appointment_cancelled
  after update on public.appointments
  for each row execute function public.notify_appointment_cancelled();

drop trigger if exists trg_notify_order_created on public.orders;
create trigger trg_notify_order_created
  after insert on public.orders
  for each row execute function public.notify_order_created();

drop trigger if exists trg_notify_stock_level on public.stock;
create trigger trg_notify_stock_level
  after insert or update on public.stock
  for each row execute function public.notify_stock_level_changed();

drop trigger if exists trg_notify_stock_deleted on public.stock;
create trigger trg_notify_stock_deleted
  after delete on public.stock
  for each row execute function public.notify_stock_deleted();

drop trigger if exists trg_notify_member_joined on public.user_profiles;
create trigger trg_notify_member_joined
  after insert on public.user_profiles
  for each row execute function public.notify_member_joined();

drop trigger if exists trg_notify_voucher_sent on public.vouchers;
create trigger trg_notify_voucher_sent
  after insert on public.vouchers
  for each row execute function public.notify_voucher_sent();

drop trigger if exists trg_notify_transfer_pending on public.pending_bookings;
create trigger trg_notify_transfer_pending
  after insert on public.pending_bookings
  for each row execute function public.notify_transfer_pending();

-- ============================================================
-- REALTIME
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;
  END IF;
END $$;

-- ============================================================
-- BACKFILL (seed unico con datos actuales)
-- ============================================================

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  a.shop_id,
  'nuevo_turno',
  'info',
  'Nuevo turno agendado',
  coalesce(c.nombre, 'Un cliente')
    || ' tiene turno el '
    || to_char(a.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
    || ' a las '
    || to_char(a.start_time at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
  '/dashboard/calendar',
  'turno:' || a.id::text,
  a.start_time
from public.appointments a
left join public.customers c on c.id = a.customer_id
where a.status in ('scheduled', 'confirmed', 'pending_payment')
  and a.start_time >= (now() - interval '7 days')
on conflict (shop_id, entity_key) do nothing;

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  a.shop_id,
  'turno_cancelado',
  'urgent',
  'Turno cancelado',
  coalesce(c.nombre, 'Un cliente')
    || ' canceló su turno del '
    || to_char(a.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
    || ' a las '
    || to_char(a.start_time at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
  '/dashboard/calendar',
  'cancelado:' || a.id::text,
  a.start_time
from public.appointments a
left join public.customers c on c.id = a.customer_id
where a.status = 'cancelled'
  and a.start_time >= (now() - interval '7 days')
on conflict (shop_id, entity_key) do nothing;

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  s.shop_id,
  'stock_bajo',
  'urgent',
  'Stock bajo',
  s.nombre_producto || ' tiene menos de 5 unidades disponibles',
  '/dashboard/inventory',
  'stock:' || s.id::text,
  coalesce(s.updated_at, s.created_at, now())
from public.stock s
where s.quantity < 5
on conflict (shop_id, entity_key) do nothing;

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  o.shop_id,
  'nuevo_pedido',
  'action',
  'Nuevo pedido de tienda',
  'Pedido de '
    || o.customer_name
    || ' por $'
    || trim(to_char(coalesce(o.total_amount, 0), 'FM999G999G999'))
    || ' esperando confirmación',
  '/dashboard/inventory?tab=orders',
  'pedido:' || o.id::text,
  o.created_at
from public.orders o
where o.status = 'pending_payment'
on conflict (shop_id, entity_key) do nothing;

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  v.shop_id,
  'voucher_enviado',
  'action',
  'Voucher enviado',
  'Voucher de ' || v.service_name || ' enviado a ' || v.gifted_to_name,
  '/dashboard/fidelizacion',
  'voucher:' || v.id::text,
  v.created_at
from public.vouchers v
where v.status = 'sent'
  and v.created_at >= (now() - interval '7 days')
on conflict (shop_id, entity_key) do nothing;

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  pb.shop_id,
  'transferencia_pendiente',
  'urgent',
  'Transferencia pendiente',
  pb.customer_name
    || ' eligió transferencia bancaria para el '
    || to_char(pb.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
    || ' a las '
    || to_char(pb.start_time at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
  '/dashboard/bank-transfers',
  'transferencia:' || pb.id::text,
  pb.created_at
from public.pending_bookings pb
where pb.status = 'pending'
  and pb.payment_method = 'bank_transfer'
  and pb.expires_at > now()
on conflict (shop_id, entity_key) do nothing;

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  up.shop_id,
  'nuevo_miembro',
  'info',
  'Nuevo miembro del equipo',
  coalesce(nullif(up.name, ''), nullif(up.nombre, ''), 'Nuevo miembro')
    || ' se unió como '
    || case up.role when 'owner' then 'dueño' when 'admin' then 'administrador' else 'staff' end,
  '/dashboard/staff',
  'miembro:' || up.user_id::text,
  up.created_at
from public.user_profiles up
where up.shop_id is not null
  and up.role in ('owner', 'admin', 'staff')
  and coalesce(up.is_active, true) = true
  and up.created_at >= (now() - interval '30 days')
on conflict (shop_id, entity_key) do nothing;

insert into public.notifications (shop_id, type, category, title, description, href, entity_key, created_at)
select
  c.shop_id,
  'recompensa_disponible',
  'action',
  'Recompensa disponible',
  c.nombre || ' tiene ' || c.loyalty_rewards_available || ' recompensa(s) pendiente(s)',
  '/dashboard/customers',
  'recompensa:' || c.id::text,
  now()
from public.customers c
where c.loyalty_rewards_available > 0
on conflict (shop_id, entity_key) do nothing;
