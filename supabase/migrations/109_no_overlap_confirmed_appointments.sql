-- 109: exclusion constraint de doble booking, esta vez bien
--
-- POR QUE 069 NO LLEGO A EXISTIR
-- -----------------------------
-- La 069 esta escrita, pero su propio comentario admite que "NOT VALID is not
-- supported for EXCLUDE constraints" y despues hace el ADD CONSTRAINT igual,
-- sin el. O sea: valida la tabla entera. Con un solo par de turnos que se
-- solape, el ADD falla y la migracion entera se cae. En esta base hay 12 pares
-- en conflicto, asi que nunca aplico. El comentario de 103 ("en esta base nunca
-- llego a existir") lo confirma.
--
-- POR QUE EL PREDICADO ES ESTRECHO
-- -------------------------------
-- Los 12 pares en conflicto que bloqueaban la 069 son todos:
--   - status = 'completed'  -> turno ya hecho, no bloquea nada
--   - en el pasado (julio 2026)
--   - staff_id IS NULL       -> cola sin profesional asignado
--
-- Por eso el predicado es `status = 'confirmed' and staff_id is not null`:
-- las 449 filas que entran al predicado no tienen ni un solo solape, asi que la
-- constraint entra sin tocar un solo dato.
--
-- status = 'confirmed' y no `not in ('cancelled','no_show')` como en 069, por
-- dos razones:
--   - 'no_show' ya no existe: la 103 lo mapeo a 'cancelled'. Con el predicado
--     viejo, 'completed' quedaba dentro y no dejaba aplicar la constraint.
--   - 'completed' es terminal. Un turno hecho no tiene por que seguir bloqueando
--     su franja, y dejaria afuera a los 12 conflictos historicos.
--
-- staff_id IS NOT NULL: los turnos sin profesional se ordenan a mano en el
-- local (es una cola, no un doble booking contra un sillon). Ademas los dos
-- paths de alta del dashboard solo chequean conflicto `if (staffId && ...)`, asi
-- que hoy se pueden crear solapados sin profesional. Incluirlos en el predicado
-- los rechazaria con un error crudo de Postgres en vez del "horario tomado" de
-- la UI.
--
-- POR QUE NO ENTRA 'pending_payment'
-- -------------------------------
-- PENDING_PAYMENT_HOLD_MINUTES = 10: un carrito iniciado retiene el slot 10
-- minutos, despues se libera solo. Un EXCLUDE no puede expresar "creado en los
-- ultimos 10 minutos" (el predicado de una constraint no puede depender del
-- reloj), asi que incluir pending_payment bloquearia el slot PARA SIEMPRE tras
-- un carrito abandonado, y no hay cron que los limpie. Sigue siendo la carrera
-- de pago que ya existía; no empeora, pero tampoco la arregla.

create extension if not exists btree_gist;

-- Si la 069 llego a aplicarse en otro entorno, esta constraint mas amplia se
-- baja primero: sin el drop, el ADD de abajo falla por nombre duplicado.
alter table appointments drop constraint if exists no_overlap_appointments;

-- La migracion 103 bajo idx_appointments_unique_slot porque habia pares con el
-- mismo shop+staff+start_time. No se la restaura: la exclusion constraint de
-- abajo cubre el mismo caso y mejor (solapes parciales, no solo mismo inicio).

do $$
begin
  -- conname solo no alcanza como clave: no es unico entre tablas del schema.
  -- Se filtra tambien por la tabla, para no saltear el ADD por culpa de una
  -- constraint homonima de otra relacion.
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'no_overlap_appointments_confirmed'
      and t.relname = 'appointments'
      and n.nspname = 'public'
  ) then
    alter table appointments
      add constraint no_overlap_appointments_confirmed
      exclude using gist (
        shop_id with =,
        staff_id with =,
        tstzrange(start_time, end_time) with &&
      )
      where (status = 'confirmed' and staff_id is not null);
  end if;
end
$$;

comment on constraint no_overlap_appointments_confirmed on public.appointments is
  'Impide solapes entre turnos confirmed del mismo local y profesional. Scoped a confirmed+staff NOT NULL a proposito: ver el encabezado de la migracion.';
