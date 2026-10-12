-- 111: claim unico del reembolso de un pago
--
-- QUE PASABA
-- -------------
-- `refundMpPayment` era read-then-write sin barrera:
--
--   1. SELECT appointments -> is_paid == true
--   2. refund.total() en Mercado Pago
--   3. UPDATE appointments SET is_paid = false
--
-- Con dos clics o dos pestanas, los dos leian `is_paid = true`, los dos
-- llamaban a `refund.total()` y los dos devolvian la plata. En el camino
-- secuencial el segundo rebotaba con un error de MP, pero en el concurrente no
-- habia ninguna barrera.
--
-- Peor todavia: el unico rastro era una fila en `mercadopago_logs` con
-- `event_type = 'refund_processed'`, que se escribia DESPUES de devolver el
-- dinero. Ese log no tiene indice unico, asi que no podia reclamar.
--
-- EL FIX
-- ------
-- El claim va en `shop_billing_events` (el mismo ledger que usan los cobros), con
-- `event_type = 'appointment_refund_applied'` y clave `payload ->> 'payment_id'`.
-- El webhook ya tiene el indice equivalente para `appointment_payment_applied`,
-- asi que este le da la vuelta: el pago no se puede aplicar dos veces NI
-- reembolsar dos veces.
--
-- Si la llamada a Mercado Pago falla, la action BORRA el claim, para que un
-- pago rechazado por MP no quede bloqueado como "ya reembolsado" y el local
-- pueda reintentarlo.

create unique index if not exists uq_shop_billing_events_appt_refund_payment_id
  on public.shop_billing_events ((payload ->> 'payment_id'))
  where event_type = 'appointment_refund_applied'
    and coalesce(payload ->> 'payment_id', '') <> '';

create index if not exists idx_shop_billing_events_appt_refund_shop_id
  on public.shop_billing_events (shop_id, created_at desc)
  where event_type = 'appointment_refund_applied';

comment on index public.uq_shop_billing_events_appt_refund_payment_id is
  'Claim del reembolso: un pago de Mercado Pago se reembolsa una sola vez. El refundMpPayment escribe esta fila antes de llamar a MP y la borra si la llamada falla.';