-- 113: `needs_review` es un estado valido del ledger de comisiones
--
-- EL PROBLEMA
-- -----------
-- La migracion 102 escribio, textual:
--
--   "'needs_review' no es un estado nuevo con CHECK constraint (status es texto
--    libre), asi que no hace falta alterar la tabla."
--
-- En el repo era cierto: ninguna migracion crea un CHECK sobre
-- `referral_commission_ledger.status`. Pero en la base real SI hay uno, puesto a
-- mano, que solo admite `pending | paid | cancelled`.
--
-- Se encontro probando el circuito de referidos contra la base: al pedir un pago
-- sin montos de Mercado Pago, `syncReferralLedgerInternal` tira
--
--   No se pudo guardar el ledger de comisiones: new row for relation
--   "referral_commission_ledger" violates check constraint
--   "referral_commission_ledger_status_check"
--
-- Y como el sync escribe TODOS los drafts en un solo upsert, el fallo de UN local
-- revienta tambien las comisiones de los demas referidos de esa corrida. O sea:
-- un auto-cargo que no se pudo resolver dejaba al vendedor sin cobrar, y sin
-- avisar, y para siempre mientras la condicion siga.
--
-- Ademas el `comment on column ... status` de la 102 ya declara los cuatro
-- valores como legitimos, asi que la base estaba contradiciendo su propia
-- documentacion.
--
-- EL FIX
-- -------
-- Recrear el CHECK con los cuatro estados del modelo. Idempotente: dropea si
-- existe y lo crea igual, para que funcione haya estado el CHECK o no.

alter table public.referral_commission_ledger
  drop constraint if exists referral_commission_ledger_status_check;

alter table public.referral_commission_ledger
  add constraint referral_commission_ledger_status_check
  check (status in ('pending', 'needs_review', 'paid', 'cancelled'));

comment on constraint public.referral_commission_ledger_status_check is
  'pending (comision calculada) | needs_review (neto desconocido, comision 0, requiere carga manual) | paid | cancelled. needs_review lo escribe el sync cuando no puede resolver el neto desde Mercado Pago; sin esta fila permitida, el upsert entero del cron falla y ningun otro local cobra.';