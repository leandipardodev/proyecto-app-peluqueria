-- ============================================================================
-- 095: Corrige admin_cleanup_user_hard para el borrado del ultimo owner
-- ----------------------------------------------------------------------------
-- Problema: dentro de plpgsql, un DELETE estatico despuves de un
-- `alter table ... disable trigger` NO respeta el estado desactivado (queda el
-- relcache/contenido de plan stale) y trigger_check_last_owner se dispara.
-- Solucion: los DELETEs de memberships/profiles van con EXECUTE (SQL dinamico),
-- que replanea y ve el trigger desactivado.
-- ============================================================================

create or replace function public.admin_cleanup_user_hard(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments set staff_id = null where staff_id = p_user_id;

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