-- 108: clave de idempotencia para los auto-cargos de suscripcion
--
-- El indice de 102 (uq_shop_billing_events_sub_auto_payment_id) protege solo
-- cuando el webhook logra resolver el payment_id. Cuando NO lo resuelve (el
-- camino que produce needs_review), el insert no tiene clave única: cada
-- reintento de MP inserta una fila Y suma otro mes a plan_expiry.
--
-- charge_key = <preapproval_id>:<YYYY-MM en Argentina>. Un auto-cargo por ciclo
-- mensual, asi que dos inserts con la misma clave son la misma notificacion
-- reintentada, no dos cobros.

-- Dedupe ANTES del índice: si ya hay filas repetidas, el CREATE UNIQUE aborta
-- la migración entera. Conserva la más antigua de cada grupo.
delete from public.shop_billing_events a
using public.shop_billing_events b
where a.event_type = 'subscription_auto_charge_applied'
  and b.event_type = 'subscription_auto_charge_applied'
  and a.shop_id = b.shop_id
  and a.payload ->> 'preapproval_id' = b.payload ->> 'preapproval_id'
  and coalesce(a.payload ->> 'charge_key', a.created_at::text) = coalesce(b.payload ->> 'charge_key', b.created_at::text)
  and a.created_at > b.created_at;

create unique index if not exists uq_shop_billing_events_sub_auto_charge_key
  on public.shop_billing_events (shop_id, (payload ->> 'charge_key'))
  where event_type = 'subscription_auto_charge_applied'
    and coalesce(payload ->> 'charge_key', '') <> '';
