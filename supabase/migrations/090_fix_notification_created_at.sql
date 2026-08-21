-- Fix turno_cancelado notifications to use appointment time instead of now()
-- Previously created_at was set to now() which always showed "Hoy" in the UI.
-- Now uses new.start_time so the notification timestamp reflects the actual appointment time.

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
    new.start_time
  )
  on conflict (shop_id, entity_key) do nothing;

  return new;
end;
$$;
