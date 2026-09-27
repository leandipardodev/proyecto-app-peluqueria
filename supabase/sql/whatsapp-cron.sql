-- WhatsApp: disparador de recordatorios cada 30 min via pg_cron de Supabase.
-- NO es una migracion: se ejecuta a mano en el SQL Editor (contiene un secreto).
--
-- Reemplazar __CRON_SECRET__ por el valor "WHATSAPP_CRON_SECRET" que te paso en
-- el chat ANTES de ejecutar. El endpoint acepta CRON_SECRET o WHATSAPP_CRON_SECRET.

-- 1) Habilita los schedulers (una sola vez)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Programa el job (idempotente: borra y recrea si ya existe)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'whatsapp-reminders') then
    perform cron.unschedule('whatsapp-reminders');
  end if;
end $$;

select cron.schedule(
  'whatsapp-reminders',
  '*/30 * * * *',
  $cron$
    select net.http_get(
      url := 'https://klip.com.ar/api/cron/whatsapp-reminders',
      headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__')
    );
  $cron$
);

-- Ver corridas (los diagnostics quedan en pg_net y en el log de la API):
--   select * from net._http_response order by id desc limit 10;
-- Desprogramar (por ej. si se pasa a Vercel Pro):
--   select cron.unschedule('whatsapp-reminders');