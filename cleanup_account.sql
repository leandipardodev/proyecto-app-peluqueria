-- Limpieza completa de leandipardo@gmail.com
-- 1) Encontrar el user_id
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'leandipardo@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Usuario no encontrado en auth.users';
    RETURN;
  END IF;

  RAISE NOTICE 'Usuario encontrado: %', v_user_id;

  -- 2) Bypass triggers
  SET session_replication_role = replica;

  -- 3) Borrar sesiones y tokens primero (foreign keys a auth.users)
  DELETE FROM auth.sessions WHERE user_id = v_user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id;
  DELETE FROM auth.identities WHERE user_id = v_user_id;

  -- 4) Borrar datos de la app
  DELETE FROM public.user_profiles WHERE user_id = v_user_id;
  DELETE FROM public.shop_memberships WHERE user_id = v_user_id;

  -- 5) Finalmente borrar el usuario auth
  DELETE FROM auth.users WHERE id = v_user_id;

  -- 6) Restaurar triggers
  SET session_replication_role = origin;

  RAISE NOTICE 'Limpieza completada';
END $$;
