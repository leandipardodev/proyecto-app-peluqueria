-- 110: idempotencia de la activacion de suscripcion automatica
--
-- QUE PASABA
-- -------------
-- El webhook de `preapproval.authorized` extendia `shops.plan_expiry` y solo
-- despues insertaba el evento `subscription_auto_activated` en el ledger. Como
-- no habia nada que reclamara el evento, cada reintento de Mercado Pago (los
-- manda cada 15 min, y para siempre) volvia a sumar un mes:
--
--   1. preapproval.authorized  -> plan_expiry +1 mes
--   2. (15 min) retry         -> plan_expiry +1 mes
--   3. (30 min) retry         -> plan_expiry +1 mes
--
-- El `upsert` de `shop_subscriptions` NO lo frenaba: su `onConflict` es
-- `preapproval_id`, asi que un reintento SOBRESCRIBE la misma fila y no viola
-- ningun indice. Por eso el sintoma era "un mes gratis por retry" y no "filas
-- duplicadas".
--
-- Esto ya se habia arreglado para `subscription_charged` (migraciones 102 y
-- 108): claim primero, extender despues. El fix se aplico a un camino y no al
-- otro.
--
-- EL FIX
-- ------
-- Indice unico sobre `payload ->> 'preapproval_id'` para el event_type
-- `subscription_auto_activated`. Un preapproval se autoriza UNA vez en su vida,
-- asi que la clave es el propio preapproval: si dos inserts traen el mismo id,
-- son la misma notificacion reintentada. Un preapproval NUEVO del mismo local
-- (re-activar la suscripcion) tiene otro id y extiende legitimamente.
--
-- Dedupe ANTES del indice: si el entorno ya quedo con filas repetidas de este
-- event_type, el CREATE UNIQUE aborta la migracion entera. Se conserva la mas
-- antigua de cada grupo, que es la que representa la activacion real; las
-- repetidas solo vuelven a sumar el mismo mes que ya se habia aplicado.

delete from public.shop_billing_events a
using public.shop_billing_events b
where a.event_type = 'subscription_auto_activated'
  and b.event_type = 'subscription_auto_activated'
  and a.shop_id = b.shop_id
  and a.payload ->> 'preapproval_id' = b.payload ->> 'preapproval_id'
  and coalesce(a.payload ->> 'preapproval_id', '') <> ''
  and a.created_at > b.created_at;

create unique index if not exists uq_shop_billing_events_sub_auto_activated_preapproval
  on public.shop_billing_events ((payload ->> 'preapproval_id'))
  where event_type = 'subscription_auto_activated'
    and coalesce(payload ->> 'preapproval_id', '') <> '';

comment on index public.uq_shop_billing_events_sub_auto_activated_preapproval is
  'Claim de preapproval.authorized: un preapproval se autoriza una sola vez, asi que repetir el insert es un reintento de Mercado Pago, no una segunda activacion. El webhook extiende plan_expiry solo si el insert es nuevo.';