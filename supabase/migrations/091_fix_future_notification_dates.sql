-- 091_fix_future_notification_dates.sql
-- Bug: todas las notificaciones aparecian agrupadas como "Hoy".
--
-- Causa:
-- 1) El backfill de 084 sembro una notificacion por turno con
--    start_time >= now() - interval '7 dias' SIN tope superior y usando
--    created_at = a.start_time -> creo filas por cada turno futuro de la
--    agenda recurrente (fechas hasta 2027).
-- 2) La 090 puso created_at = new.start_time en notify_appointment_cancelled,
--    asi que cancelar un turno futuro generaba notificaciones con fecha futura.
--
-- En el panel cualquier fecha futura cae en el grupo "Hoy" (diffDays <= 0),
-- y ademas esas filas desplazaban las reales del limit(50) del GET.

-- ------------------------------------------------------------
-- 1) El momento del evento es la cancelacion, no el inicio del turno.
--    (revierte el criterio de la 090; ahora() es honesto: la notificacion
--    nace hoy y el feed la muestra como "hace X" / "Hoy")
-- ------------------------------------------------------------

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

-- ------------------------------------------------------------
-- 2) Limpieza: ninguna notificacion ya creada puede tener fecha futura.
--    Elimina el ruido del backfill de 084 y de la 090 (~565 filas).
--    Las notificaciones de estado (recompensas, cumpleaños, etc.) se
--    regeneran solas en el proximo GET si corresponden.
-- ------------------------------------------------------------

delete from public.notifications
where created_at > now();
