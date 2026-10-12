-- 112: amount_paid, la plata REALMENTE cobrada por cada turno
--
-- EL PROBLEMA
-- ------------
-- Todos los agregados de la app (KPI de Ingresos, Balance, caja, comisiones del
-- personal, graficos de Inicio, CSV) sumaban `service_price` filtrando por
-- `is_paid`. O sea: "precio de lista de los turnos marcados como pagados".
--
-- Con seña eso queda inflado por el factor `service_price / deposit_amount`. Un
-- servicio de $40.000 con seña de $3.000 reportaba $40.000 de ingreso, y la
-- comision del profesional se calculaba tambien sobre los $40.000. La plata que
-- entro fueron $3.000.
--
-- `deposit_amount` ya se guardaba y ya se mostra (modal del turno, tabla, CSV),
-- pero no entraba en NINGUN agregado: aparecia en 83 lugares del codigo y en
-- ninguno era una suma.
--
-- LA COLUMNA
-- -----------
-- `amount_paid` = plata cobrada hasta ahora por ese turno. Se escribe en los
-- mismos momentos en que hoy se escribe `is_paid`:
--
--   - el webhook aprueba el pago de la seña   -> amount_paid = lo que pago MP
--   - el turno se completa o se marca pagado    -> amount_paid = precio - descuento
--   - se desmarca como pagado                  -> amount_paid = la seña
--
-- O sea: `is_paid` sigue significando "este turno cuenta como ingreso" (no se
-- toca ningun filtro), lo que cambia es CUANTO cuenta.
--
-- EL BACKFILL
-- -----------
-- Para lo que ya esta cargado. Las filas anteriores a esta migracion no tienen
-- como registrar cuando se cobro el saldo en el mostrador, asi que se asume el
-- caso mas comun: si hay seña y es menor que el precio, se toma que solo esta
-- cobrada la seña; si no, que el turno esta completo.

alter table public.appointments
  add column if not exists amount_paid numeric;

comment on column public.appointments.amount_paid is
  'Plata efectivamente cobrada por este turno. Es lo que suman los KPIs de ingresos, el Balance, la caja y las comisiones. NULL = la migracion 112 todavia no se aplico y los agregados caen a service_price.';

update public.appointments
set amount_paid = round(
  case
    -- Pagado con seña menor al precio: solo se sabe que se cobro la seña.
    when is_paid
         and coalesce(deposit_amount, 0) > 0
         and coalesce(deposit_amount, 0) < coalesce(service_price, 0)
      then coalesce(deposit_amount, 0)
    -- Pagado completo: el precio de lista menos el descuento de fidelidad.
    when is_paid
      then coalesce(service_price, 0)
           * (1 - least(greatest(coalesce(loyalty_discount_percent_applied, 0), 0), 100) / 100.0)
    -- No pagado: si tiene seña cargada se la muestra, aunque no entre en el
    -- ingreso (los agregados filtran por is_paid = true).
    else coalesce(deposit_amount, 0)
  end
, 2)
where amount_paid is null;

-- Los agregados filtran por shop_id + is_paid + rango de fecha. Este indice
-- cubre el patron nuevo sin tener que tocar los que ya existen.
create index if not exists idx_appointments_shop_paid_window
  on public.appointments (shop_id, is_paid, start_time);