-- =============================================================================
-- 101_fix_admin_delete_shop.sql
--
-- admin_delete_shop() fallaba SIEMPRE, para cualquier local. La linea que borra
-- los items de liquidacion referenciaba 'staff_liquidation_id', columna que no
-- existe (la real es 'liquidation_id', ver 000_baseline.sql). Postgres valida
-- los nombres de columna antes de ejecutar, asi que tiraba 42703 aunque la
-- tabla estuviera vacia -> el borrado nunca llegaba ni a la linea de
-- referral_attributions.
--
-- Consecuencia: no se podia borrar ningun local desde /admin. El error lo
-- reportaba src/lib/admin/user-management.ts:317 como { success: false }.
--
-- No tiene relacion con el sistema de referidos; se separa en su propia
-- migracion para no mezclarla con la 100, que si mueve plata.
-- =============================================================================

begin;

create or replace function public.admin_delete_shop(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shops set active = false, updated_at = now() where id = p_shop_id;

  delete from public.combo_services where service_id in (select id from public.services where shop_id = p_shop_id);
  delete from public.staff_services where service_id in (select id from public.services where shop_id = p_shop_id);
  delete from public.services where shop_id = p_shop_id;
  delete from public.staff_schedules where staff_id in (select user_id from public.shop_memberships where shop_id = p_shop_id);
  delete from public.staff_compensation_rules where staff_user_id in (select user_id from public.shop_memberships where shop_id = p_shop_id);
  -- FIX: la columna es liquidation_id, no staff_liquidation_id
  delete from public.staff_liquidation_items where liquidation_id in (select id from public.staff_liquidations where shop_id = p_shop_id);
  delete from public.staff_liquidations where shop_id = p_shop_id;
  delete from public.staff_commission_overrides where shop_id = p_shop_id;
  delete from public.appointments where shop_id = p_shop_id;
  delete from public.customers where shop_id = p_shop_id;
  delete from public.cash_movements where shop_id = p_shop_id;
  delete from public.cash_sessions where shop_id = p_shop_id;
  delete from public.finances where shop_id = p_shop_id;
  delete from public.stock where shop_id = p_shop_id;
  delete from public.vouchers where shop_id = p_shop_id;
  delete from public.leads_global where shop_id = p_shop_id;
  delete from public.pending_bookings where shop_id = p_shop_id;
  delete from public.mercadopago_logs where shop_id = p_shop_id;
  delete from public.product_event_markers where shop_id = p_shop_id;
  delete from public.product_events where shop_id = p_shop_id;
  delete from public.referral_link_clicks where shop_id = p_shop_id;
  delete from public.referral_attributions where shop_id = p_shop_id;
  delete from public.referral_commission_ledger where shop_id = p_shop_id;
  delete from public.shop_billing_events where shop_id = p_shop_id;
  delete from public.shop_booking_theme where shop_id = p_shop_id;
  delete from public.admin_allowlist where shop_id = p_shop_id;
  delete from public.shop_memberships where shop_id = p_shop_id;

  delete from public.shops where id = p_shop_id;
end;
$$;

commit;
