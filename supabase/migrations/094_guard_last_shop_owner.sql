-- ============================================================================
-- 094: Guardar el ultimo owner de un local en shop_memberships
-- ----------------------------------------------------------------------------
-- Defensa en profundidad contra el bug "al agregar un profesional se degrada
-- el owner": evita que se demote/desactive/elimine la membership del ultimo
-- OWNER activo de un local MIENTRAS el local siga activo y tenga OTRO
-- personal activo.
--
-- Reglas:
--   - Solo actua sobre filas cuyo rol actual es 'owner' y estan activas.
--   - Si el local esta inactivo (active=false) no bloquea nada (limpieza).
--   - Bloquea demotion/desactivacion/delete SOLO si quedan otros miembros
--     activos y no queda ningun otro owner.
--   - INSERTs (nuevos owners/miembros) no se ven afectados.
--
-- admin_delete_shop() se ajusta para desactivar el local ANTES de borrar,
-- de modo que el borrado masivo en cascada siga funcionando.
-- ============================================================================

create or replace function public.guard_last_shop_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shop_active boolean;
  remaining_members int;
  remaining_owners int;
begin
  if old.role <> 'owner' or old.is_active is not true then
    return coalesce(new, old);
  end if;

  select coalesce(active, false) into shop_active from public.shops where id = old.shop_id;

  if shop_active is not true then
    return coalesce(new, old);
  end if;

  select count(*) into remaining_members
    from public.shop_memberships
    where shop_id = old.shop_id
      and is_active = true
      and id <> old.id;

  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (new.role <> 'owner' or new.is_active is not true)) then
    if remaining_members > 0 then
      select count(*) into remaining_owners
        from public.shop_memberships
        where shop_id = old.shop_id
          and is_active = true
          and role = 'owner'
          and id <> old.id;

      if remaining_owners = 0 then
        raise exception 'No podes quitar el unico owner del local mientras quede otro personal activo.';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_last_shop_owner on public.shop_memberships;

create trigger trg_guard_last_shop_owner
  before update or delete on public.shop_memberships
  for each row execute function public.guard_last_shop_owner();

-- Ajuste: admin_delete_shop debe desactivar el local antes de borrar, para que
-- el triger de arriba no bloquee el borrado en cascada de una tienda completa.
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
  delete from public.staff_liquidation_items where staff_liquidation_id in (select id from public.staff_liquidations where shop_id = p_shop_id);
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
  delete from public.referral_attributions where shop_id = p_shop_id;
  delete from public.referral_commission_ledger where shop_id = p_shop_id;
  delete from public.shop_billing_events where shop_id = p_shop_id;
  delete from public.shop_booking_theme where shop_id = p_shop_id;
  delete from public.admin_allowlist where shop_id = p_shop_id;
  delete from public.shop_memberships where shop_id = p_shop_id;

  delete from public.shops where id = p_shop_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_cleanup_user_hard(): borrado COMPLETO de un usuario (datos public + auth).
-- A diferencia de admin_cleanup_user_data(), desactiva temporalmente el trigger
-- trigger_check_last_owner para permitir eliminar el perfil del ultimo owner de
-- un local (p. ej. un local abandonado/inactivo). Corre como SECURITY DEFINER
-- (propietario = postgres, superuser), por lo que el ALTER TABLE solo se ejecuta
-- dentro de esta funcion. Restaura los triggers aunque falle el borrado.
-- ----------------------------------------------------------------------------
create or replace function public.admin_cleanup_user_hard(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments set staff_id = null where staff_id = p_user_id;

  -- Si existe un trigger duplicado de check_last_owner (por fuera de las
  -- migraciones), se elimina: trigger_check_last_owner ya cubre UPDATE y DELETE.
  drop trigger if exists tr_check_last_owner on public.user_profiles;

  alter table public.user_profiles disable trigger trigger_check_last_owner;
  alter table public.shop_memberships disable trigger trg_guard_last_shop_owner;

  begin
    -- NOTA: los DELETEs van con EXECUTE (SQL dinamico). Un DELETE estatico
    -- dentro de plpgsql puede ver el estado stale del trigger (aun desactivado
    -- por el ALTER) y disparar trigger_check_last_owner; EXECUTE replanea y respeta
    -- el estado desactivado.
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