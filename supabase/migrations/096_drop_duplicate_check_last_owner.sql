-- ============================================================================
-- 096: Elimina un trigger duplicado de check_last_owner creado fuera de banda
-- ----------------------------------------------------------------------------
-- En produccion habia DOS triggers sobre user_profiles que ejecutan
-- check_last_owner():
--   * trigger_check_last_owner  (BEFORE UPDATE OR DELETE)  -> viene de 000_baseline
--   * tr_check_last_owner       (BEFORE DELETE)             -> NO esta en ninguna
--                                                             migracion (SQL manual)
-- Deshabilitar solo trigger_check_last_owner no alcanzaba: el duplicado seguia
-- disparando y bloqueaba el borrado del ultimo owner. Aqui se elimina el
-- duplicado y se redefine admin_cleanup_user_hard para que tambien lo elimine
-- (robusto si vuelve a aparecer uno por fuera de las migraciones).
-- ============================================================================

drop trigger if exists tr_check_last_owner on public.user_profiles;

create or replace function public.admin_cleanup_user_hard(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments set staff_id = null where staff_id = p_user_id;

  -- Elimina un hipotetico duplicado (trigger_check_last_owner ya cubre UPDATE y DELETE).
  drop trigger if exists tr_check_last_owner on public.user_profiles;

  alter table public.user_profiles disable trigger trigger_check_last_owner;
  alter table public.shop_memberships disable trigger trg_guard_last_shop_owner;

  begin
    execute 'delete from public.shop_memberships where user_id = ' || quote_literal(p_user_id);
    execute 'delete from public.user_profiles where user_id = ' || quote_literal(p_user_id);
  exception when others then
    alter table public.user_profiles enable trigger trigger_check_last_owner;
    alter table public.shop_memberships enable trigger trg_guard_last_shop_owner;
    raise;
  end;

  alter table public.user_profiles enable trigger trigger_check_last_owner;
  alter table public.shop_memberships enable trigger trg_guard_last_shop_owner;
end;
$$;