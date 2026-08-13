-- Indicador para turnos auto-completados que al pasar su horario de fin estaban
-- en estado pending_payment (reserva online con pago pendiente). Se marcan como
-- pagados por default pero queda la marca para que el local pueda reclamar el pago.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS was_pending_payment boolean NOT NULL DEFAULT false;
