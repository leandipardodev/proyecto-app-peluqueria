-- =============================================================================
-- 100_referral_sellers.sql
-- Sistema de referidos operable: login por PIN para vendedores, captura por
-- link, traza de clics, y reparacion de las dos restricciones que hoy hacen
-- fallar el calculo de comisiones.
--
-- El programa de comisiones NUNCA funciono: el upsert de
-- src/lib/admin/referrals.ts usa onConflict "billing_event_id" pero no habia
-- ninguna restriccion unica sobre esa columna, asi que Postgres rechazaba
-- siempre con 42P10. Por eso el ledger esta vacio.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Limpieza defensiva antes de crear los indices unicos
-- -----------------------------------------------------------------------------

-- Un billing_event no puede generar dos filas de ledger. Si quedaron duplicados
-- (por ejemplo de unUpsert manual previo), nos quedamos con la mas vieja.
delete from public.referral_commission_ledger a
  using public.referral_commission_ledger b
  where a.id > b.id
    and a.billing_event_id is not distinct from b.billing_event_id;

-- Un local solo puede tener un vendedor. Si quedaron duplicados, se queda el
-- mas antiguo para no cambiarle el vendor a un local que ya se liquido.
delete from public.referral_attributions a
  using public.referral_attributions b
  where a.id > b.id
    and a.shop_id = b.shop_id;

-- -----------------------------------------------------------------------------
-- 2. Restricciones que faltaban
-- -----------------------------------------------------------------------------

create unique index if not exists uq_referral_ledger_billing_event
  on public.referral_commission_ledger (billing_event_id);

create unique index if not exists uq_referral_attributions_shop
  on public.referral_attributions (shop_id);

create index if not exists idx_referral_ledger_pending
  on public.referral_commission_ledger (status, payment_applied_at desc)
  where status = 'pending';

-- -----------------------------------------------------------------------------
-- 3. Credencial de login del vendedor
--
-- El PIN vive ACA y es solo la llave de entrada. La identidad real del
-- vendedor es referral_partners.id, que nunca cambia: regenerar el PIN no
-- puede tocar referral_code ni las atribuciones ya cargadas.
-- pin_last4 existe para que el admin identifique al vendedor en la lista sin
-- poder leer el PIN.
-- -----------------------------------------------------------------------------

alter table public.referral_partners
  add column if not exists pin_hash text,
  add column if not exists pin_last4 text,
  add column if not exists pin_updated_at timestamptz,
  add column if not exists payout_alias text,
  add column if not exists payout_cbu text;

-- -----------------------------------------------------------------------------
-- 4. Freno de login por IP
--
-- Deliberadamente NO se bloquea por partner_id: si el freno fuera por
-- vendedor, un atacante podia dejar afuera a un vendedor real con solo probar
-- su PIN. Es por IP, con retroceso exponencial en referral_login_attempts.
-- -----------------------------------------------------------------------------

create table if not exists public.referral_login_attempts (
  ip            text primary key,
  attempts      integer not null default 0,
  last_at       timestamptz not null default now(),
  locked_until  timestamptz
);

alter table public.referral_login_attempts enable row level security;
drop policy if exists "referral_login_attempts_no_direct_access" on public.referral_login_attempts;
create policy "referral_login_attempts_no_direct_access" on public.referral_login_attempts
  as permissive for all to authenticated using (false) with check (false);

-- -----------------------------------------------------------------------------
-- 5. Traza de visitas a links de vendedor
--
-- Sirve para dos cosas:-mostrarle al vendedor los locales que otro le quedo
-- (gana el primero), y tener trazabilidad si un vendedor se queja.
-- -----------------------------------------------------------------------------

create table if not exists public.referral_link_clicks (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.referral_partners(id) on delete cascade,
  shop_id     uuid references public.shops(id) on delete set null,
  code        text not null,
  -- 'attributed'     el local quedo asignado a este vendedor
  -- 'already_taken'  el local ya tenia otro vendedor
  -- 'not_a_shop'     el visitante todavia no tiene local
  outcome     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_referral_link_clicks_partner
  on public.referral_link_clicks (partner_id, created_at desc);

create index if not exists idx_referral_link_clicks_shop
  on public.referral_link_clicks (shop_id, created_at desc);

alter table public.referral_link_clicks enable row level security;
drop policy if exists "referral_link_clicks_no_direct_access" on public.referral_link_clicks;
create policy "referral_link_clicks_no_direct_access" on public.referral_link_clicks
  as permissive for all to authenticated using (false) with check (false);

-- -----------------------------------------------------------------------------
-- 6. Trazabilidad del monto usado en la comision
--
-- 'payment_event'  el monto y la comision de MPNfueron leidos del evento real
-- 'checkout_join'  el monto se cruzo con subscription_checkout_created
-- 'fallback_price' no se encontro el monto, se uso el precio actual como ultimo recurso
-- -----------------------------------------------------------------------------

alter table public.referral_commission_ledger
  add column if not exists amount_source text,
  add column if not exists mp_fee numeric not null default 0,
  add column if not exists net_amount numeric not null default 0;

comment on column public.referral_commission_ledger.amount_source is
  'payment_event | checkout_join | fallback_price';

-- -----------------------------------------------------------------------------
-- 7. Default del programa
--
-- El referidor cobra lo que efectivamente entra a Klip: el porcentaje se
-- aplica sobre (monto - comision de Mercado Pago), no sobre el monto bruto.
-- Con 100% por defecto Klip no retiene nada de esos 2 meses, que es
-- exactamente lo pedido.
--
-- fallback_mp_fee_percent solo se usa cuando no encontramos el monto real del
-- pago (pago anterior a que el webhook guardara la fee). Es una estimacion
-- conservative a proposito: sobreestimar la fee hace que Klip NO quede en
-- perdida por un pago del que no tenemos el dato.
-- -----------------------------------------------------------------------------

alter table public.referral_program_settings
  add column if not exists fallback_mp_fee_percent numeric not null default 4;

update public.referral_program_settings
  set default_commission_percent = 100,
      default_commission_months = 2,
      updated_at = now()
  where is_default = true;

-- Si la tabla de settings esta vacia (entorno nuevo), sembramos la fila.
insert into public.referral_program_settings (
  is_default, default_commission_percent, default_commission_months, fallback_mp_fee_percent
)
select true, 100, 2, 4
where not exists (select 1 from public.referral_program_settings where is_default = true);

-- -----------------------------------------------------------------------------
-- 8. RPC de pago fila por fila
--
-- El modelo de pago acordado es UNA TRANSFERENCIA POR LOCAL Y POR MES, asi
-- que admin_mark_partner_commissions_paid (que agrupa todo lo pendiente de un
-- partner en un solo pago) no alcanza. Esta version recibe las filas
-- concretas a pagar.
-- -----------------------------------------------------------------------------

create or replace function public.admin_mark_referral_ledger_paid(
  p_ledger_ids uuid[],
  p_actor_user_id uuid
)
returns table(updated_count integer, total_amount numeric, payout_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(14,2) := 0;
  v_count integer := 0;
  v_payout_id uuid;
  v_partner uuid;
begin
  if p_ledger_ids is null or array_length(p_ledger_ids, 1) is null then
    return query select 0::integer, 0::numeric, null::uuid;
    return;
  end if;

  select min(partner_id) into v_partner
  from public.referral_commission_ledger
  where id = any(p_ledger_ids) and status = 'pending';

  if v_partner is null then
    return query select 0::integer, 0::numeric, null::uuid;
    return;
  end if;

  with locked_rows as (
    select id, commission_amount
    from public.referral_commission_ledger
    where id = any(p_ledger_ids)
      and status = 'pending'
      and partner_id = v_partner
    for update
  ),
  stats as (
    select coalesce(sum(commission_amount), 0)::numeric(14,2) as total,
           count(*)::integer as cnt
    from locked_rows
  )
  select total, cnt into v_total, v_count from stats;

  if v_count = 0 then
    return query select 0::integer, 0::numeric, null::uuid;
    return;
  end if;

  insert into public.referral_commission_payouts (partner_id, paid_at, amount, status, created_by, created_at, updated_at)
  values (v_partner, now(), v_total, 'paid', p_actor_user_id, now(), now())
  returning id into v_payout_id;

  update public.referral_commission_ledger
  set status = 'paid', paid_at = now(), payout_id = v_payout_id, updated_at = now()
  where id = any(p_ledger_ids)
    and status = 'pending'
    and partner_id = v_partner;

  return query select v_count, v_total, v_payout_id;
end;
$$;

comment on function public.admin_mark_referral_ledger_paid(uuid[], uuid) is
  'Marca como pagadas filas concretas del ledger y agrupa el resultado en un payout. Filas de otros partners se ignoran.';

commit;
