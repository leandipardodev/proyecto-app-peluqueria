-- 079: Desasignar appointments antes de borrar usuario para evitar FK violation
CREATE OR REPLACE FUNCTION admin_cleanup_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE appointments SET staff_id = NULL WHERE staff_id = p_user_id;
  DELETE FROM shop_memberships WHERE user_id = p_user_id;
  DELETE FROM user_profiles WHERE user_id = p_user_id;
END;
$$;
