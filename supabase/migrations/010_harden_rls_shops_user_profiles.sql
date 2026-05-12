-- Incremental RLS hardening for shops and user_profiles
-- Goal: granular SELECT/UPDATE policies without recursion risk

begin;

alter table if exists public.shops enable row level security;
alter table if exists public.user_profiles enable row level security;

create or replace function public.current_user_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.shop_id
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.current_user_shop_id() from public;
grant execute on function public.current_user_shop_id() to authenticated;

-- Remove legacy/over-broad policies that can conflict
drop policy if exists superadmin_profiles on public.user_profiles;
drop policy if exists view_shop_users on public.user_profiles;
drop policy if exists manage_shop_users on public.user_profiles;
drop policy if exists read_own_profile on public.user_profiles;
drop policy if exists update_own_profile on public.user_profiles;
drop policy if exists insert_own_profile on public.user_profiles;
drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_update_own on public.user_profiles;
drop policy if exists user_profiles_insert_own on public.user_profiles;

drop policy if exists superadmin_shops on public.shops;
drop policy if exists view_own_shop on public.shops;
drop policy if exists shops_access on public.shops;
drop policy if exists shops_public_read on public.shops;
drop policy if exists shops_select_own on public.shops;
drop policy if exists shops_update_own on public.shops;
drop policy if exists shops_select_public_active on public.shops;

-- user_profiles: user can read/update/insert only own profile
create policy user_profiles_select_own
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

create policy user_profiles_update_own
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_profiles_insert_own
on public.user_profiles
for insert
to authenticated
with check (user_id = auth.uid());

-- shops: authenticated user can read/update only its own shop
create policy shops_select_own
on public.shops
for select
to authenticated
using (id = public.current_user_shop_id());

create policy shops_update_own
on public.shops
for update
to authenticated
using (id = public.current_user_shop_id())
with check (id = public.current_user_shop_id());

-- public booking needs reading active shops
create policy shops_select_public_active
on public.shops
for select
to anon
using (active = true);

-- Guardrail: prevent deleting or downgrading the last active owner in a shop
create or replace function public.check_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count int;
begin
  select count(*)
    into owner_count
  from public.user_profiles
  where shop_id = old.shop_id
    and role = 'owner'
    and is_active = true;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.is_active = true and owner_count <= 1 then
      raise exception 'No podes eliminar al unico administrador. Cede el rol de Owner a otro usuario primero.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner'
       and old.is_active = true
       and owner_count <= 1
       and (new.role <> 'owner' or new.is_active = false) then
      raise exception 'No podes eliminar al unico administrador. Cede el rol de Owner a otro usuario primero.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_check_last_owner on public.user_profiles;
create trigger tr_check_last_owner
before update or delete on public.user_profiles
for each row
execute function public.check_last_owner();

commit;
