-- Simplificar el modelo de estados de turno de 7 valores a 4.
--
-- Motivo: 'scheduled' y 'confirmed' eran indistinguibles para el usuario
-- (el unico consumidor real era la alarma del navegador y el badge de
-- "urgente"), e 'in_progress' y 'no_show' nunca se escribian desde ningun
-- camino de codigo. Quedan 4 estados con significado:
--   confirmed       -> turno abierto ("agendado")
--   pending_payment -> esperando aprobacion de Mercado Pago
--   completed       -> hecho; el cobro se decide con is_paid, no con el estado
--   cancelled       -> cancelado / no se atendio

-- 1. Normalizar datos existentes antes de apretar el CHECK.
update appointments set status = 'confirmed' where status in ('scheduled', 'in_progress');
update appointments set status = 'cancelled' where status = 'no_show';

-- 2. CHECK con los 4 valores soportados.
alter table appointments drop constraint if exists appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('confirmed', 'pending_payment', 'completed', 'cancelled'));

-- 3. El exclusion constraint de 069 excluia 'cancelled' y 'no_show'.
--    'no_show' ya no existe, asi que queda solo 'cancelled'.
alter table appointments drop constraint if exists no_overlap_appointments;
alter table appointments
  add constraint no_overlap_appointments
  exclude using gist (
    shop_id with =,
    coalesce(staff_id, '00000000-0000-0000-0000-000000000000') with =,
    tstzrange(start_time, end_time) with &&
  )
  where (status <> 'cancelled');

-- 4. idx_appointments_unique_slot (creado en 065) queda redundante: el
--    exclusion constraint de arriba ya cubre solapamiento real de rangos,
--    mientras este solo detectaba start_time identico. Ademas arrastraba el
--    filtro viejo not in ('cancelled', 'no_show').
drop index if exists idx_appointments_unique_slot;
