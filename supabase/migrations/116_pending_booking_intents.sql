-- Extiende pending_bookings para soportar intenciones de reserva/pago online
-- sin crear appointments visibles antes de confirmar el pago (fase 2).
-- payload guarda la estructura completa (cart/combo/combined) necesaria para
-- materializar turnos/pedidos al aprobarse el pago en el webhook.

alter table if exists public.pending_bookings
  add column if not exists intent_type text not null default 'single';

alter table if exists public.pending_bookings
  add column if not exists payload jsonb not null default '{}'::jsonb;

comment on column public.pending_bookings.intent_type is
  'Tipo de intención: single, cart, combo, combined.';

comment on column public.pending_bookings.payload is
  'Datos adicionales para recrear la reserva al confirmar el pago (servicios, combo, order/store, etc.).';
