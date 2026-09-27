-- 102_referral_auto_charge_ledger.sql
--
-- Soporte de cobros automaticos de suscripcion en el ledger de comisiones.
--
-- Contexto: hasta ahora el sync solo leia `subscription_payment_applied` (el pago
-- inicial) y `subscription_checkout_created` (el checkout manual). Los cobros
-- mensuales automaticos, que llegan como `subscription_auto_charge_applied`, no
-- se contaban: la secuencia de pagos de cada local nunca avanzaba al renovarse y
-- el vendedor recibia 0 en vez de su comision.
--
-- Este script NO cambia como se calcula el neto (eso vive en el codigo), solo
-- prepara lo que la base necesita para que el auto-cargo sea idempotente y para
-- documentar los dos valores nuevos de estado.

-- -----------------------------------------------------------------------------
-- 1. Idempotencia del evento de auto-cargo
--
-- Mercado Pago reintenta el webhook de `subscription_charged` cuando no recibe
-- un 2xx. Cada intento inserta un evento, y sin este indice el mismo cobro se
-- contaria N veces: cada reintento consumiria uno de los 2 pagos del local y el
-- vendedor perderia la comision de un mes que si le corresponde.
--
-- El indice es por payment_id y es PARCIAL a proposito:
--   - si el webhook no pudo resolver el pago real, el payload no trae
--     payment_id, y esa fila tiene que poder insertarse (queda needs_review).
--   - asi que solo colisionan las filas que SI tienen pago identificado.
--
-- Se deduplica antes de crear el indice para que la migracion corra en
-- cualquier entorno, no solo en uno limpio.
-- -----------------------------------------------------------------------------

with ranked as (
  select
    id,
    row_number() over (
      partition by shop_id, payload->>'payment_id'
      order by created_at asc, id asc
    ) as rn
  from public.shop_billing_events
  where event_type = 'subscription_auto_charge_applied'
    and coalesce(payload->>'payment_id', '') <> ''
)
delete from public.shop_billing_events
where id in (select id from ranked where rn > 1);

create unique index if not exists uq_shop_billing_events_sub_auto_payment_id
  on public.shop_billing_events ((payload->>'payment_id'))
  where event_type = 'subscription_auto_charge_applied'
    and coalesce(payload->>'payment_id', '') <> '';

-- -----------------------------------------------------------------------------
-- 2. Estados y fuentes de monto
--
-- `fallback_price` se elimina como valor de amount_source. Cuando existia, el
-- sync multiplicaba el PRECIO VIGENTE del plan (15.000) por el fee de fallback
-- para los pagos que no traian monto real. Con precios historicos de 25.000 y
-- 9.500 en la base, eso pagaba al vendedor sobre un importe que el local nunca
-- pago. Es plata que salia de Klip, no un redondeo.
--
-- Ahora, si no hay monto real ni checkout que lo respalde, la fila se crea con
-- amount_source = 'unknown' y status = 'needs_review': comision 0, visible en el
-- panel, esperando que un humano la cargue.
--
-- 'needs_review' no es un estado nuevo con CHECK constraint (status es text
-- libre), asi que no hace falta alterar la tabla. Se documenta para que no se
-- lea como un typo.
-- -----------------------------------------------------------------------------

comment on column public.referral_commission_ledger.amount_source is
  'payment_event | checkout_join | unknown. unknown + status needs_review = el neto no se pudo determinar y la comision queda en 0 a la espera de carga manual.';

comment on column public.referral_commission_ledger.status is
  'pending (comision calculada) | needs_review (neto desconocido, comision 0, requiere carga manual) | paid | cancelled';
