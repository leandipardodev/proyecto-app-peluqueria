-- Simplificar el modelo de estados de turno de 7 valores a 4.
--
-- Motivo: 'scheduled' y 'confirmed' eran indistinguibles para el usuario, e
-- 'in_progress' y 'no_show' nunca se escribieron desde ningun camino de codigo.
-- En los datos reales solo conviven 'scheduled' (485 filas), 'confirmed',
-- 'pending_payment', 'completed' y 'cancelled'. Quedan 4 estados:
--   confirmed       -> turno abierto ("agendado")
--   pending_payment -> esperando aprobacion de Mercado Pago
--   completed       -> hecho; el cobro se decide con is_paid, no con el estado
--   cancelled       -> cancelado / no se atendio
--
-- Nota sobre las 485 filas 'scheduled': 318 ya pasaron de fecha y 167 son
-- futuras. Todas tienen is_paid = false, asi que mapearlas a 'confirmed' no
-- altera los reportes de dinero. Las 318 pasadas quedan visibles como
-- "Agendado" en vez de quedar con un estado sin etiqueta.
--
-- NO se toca aca el exclusion constraint no_overlap_appointments: en esta base
-- nunca llego a existir (ver 104).

-- 1. Normalizar datos existentes antes de apretar el CHECK.
update appointments set status = 'confirmed' where status in ('scheduled', 'in_progress');
update appointments set status = 'cancelled' where status = 'no_show';

-- 2. CHECK con los 4 valores soportados.
alter table appointments drop constraint if exists appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('confirmed', 'pending_payment', 'completed', 'cancelled'));

-- 3. idx_appointments_unique_slot (creado en 065) tampoco llego a existir en
--    esta base: hay pares con el mismo shop+staff+start_time que lo violarian.
--    Si existe en otro entorno queda redundante igual, asi que se baja en
--    ambos casos.
drop index if exists idx_appointments_unique_slot;
