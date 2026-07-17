-- Admin panel: gestion de usuarios y tiendas

-- 1. Columna de baneo en user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS banned_reason text;

-- 2. RPC para borrar tienda en cascada (borra todas las tablas child en orden correcto)
CREATE OR REPLACE FUNCTION admin_delete_shop(p_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Borrar tablas child en orden (las que tienen NO ACTION en shop_id)
  DELETE FROM combo_services WHERE service_id IN (SELECT id FROM services WHERE shop_id = p_shop_id);
  DELETE FROM staff_services WHERE service_id IN (SELECT id FROM services WHERE shop_id = p_shop_id);
  DELETE FROM services WHERE shop_id = p_shop_id;
  DELETE FROM staff_schedules WHERE staff_id IN (SELECT user_id FROM shop_memberships WHERE shop_id = p_shop_id);
  DELETE FROM staff_compensation_rules WHERE staff_user_id IN (SELECT user_id FROM shop_memberships WHERE shop_id = p_shop_id);
  DELETE FROM staff_liquidation_items WHERE staff_liquidation_id IN (SELECT id FROM staff_liquidations WHERE shop_id = p_shop_id);
  DELETE FROM staff_liquidations WHERE shop_id = p_shop_id;
  DELETE FROM staff_commission_overrides WHERE shop_id = p_shop_id;
  DELETE FROM appointments WHERE shop_id = p_shop_id;
  DELETE FROM customers WHERE shop_id = p_shop_id;
  DELETE FROM cash_movements WHERE shop_id = p_shop_id;
  DELETE FROM cash_sessions WHERE shop_id = p_shop_id;
  DELETE FROM finances WHERE shop_id = p_shop_id;
  DELETE FROM stock WHERE shop_id = p_shop_id;
  DELETE FROM vouchers WHERE shop_id = p_shop_id;
  DELETE FROM leads_global WHERE shop_id = p_shop_id;
  DELETE FROM pending_bookings WHERE shop_id = p_shop_id;
  DELETE FROM mercadopago_logs WHERE shop_id = p_shop_id;
  DELETE FROM product_event_markers WHERE shop_id = p_shop_id;
  DELETE FROM product_events WHERE shop_id = p_shop_id;
  DELETE FROM referral_attributions WHERE shop_id = p_shop_id;
  DELETE FROM referral_commission_ledger WHERE shop_id = p_shop_id;
  DELETE FROM shop_billing_events WHERE shop_id = p_shop_id;
  DELETE FROM shop_booking_theme WHERE shop_id = p_shop_id;
  DELETE FROM admin_allowlist WHERE shop_id = p_shop_id;
  DELETE FROM shop_memberships WHERE shop_id = p_shop_id;
  -- Las tablas con CASCADE (combos, shop_date_overrides, shop_subscriptions) se borran solas

  -- Borrar la tienda
  DELETE FROM shops WHERE id = p_shop_id;
END;
$$;

-- 3. RPC para limpiar datos de usuario en public schema
-- (la eliminacion de auth.users se hace desde la app via Supabase Admin API)
CREATE OR REPLACE FUNCTION admin_cleanup_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Borrar membresias
  DELETE FROM shop_memberships WHERE user_id = p_user_id;
  -- user_profiles cascades a staff_profiles, staff_services, staff_schedules, shop_date_overrides
  DELETE FROM user_profiles WHERE user_id = p_user_id;
END;
$$;
