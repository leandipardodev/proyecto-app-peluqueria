-- Fix shops RLS to use shop_memberships instead of current_user_shop_id()
-- Allows multi-shop users to access all their shops via membership table,
-- consistent with every other table (appointments, customers, services, etc.)

drop policy if exists "shops_membership_access" on public.shops;
create policy "shops_membership_access" on public.shops
  as permissive for all to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shops.id and sm.user_id = auth.uid() and sm.is_active = true
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shops.id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));

drop policy if exists "shops_select_own" on public.shops;
create policy "shops_select_own" on public.shops
  as permissive for select to authenticated using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shops.id and sm.user_id = auth.uid() and sm.is_active = true
  ));

drop policy if exists "shops_update_own" on public.shops;
create policy "shops_update_own" on public.shops
  as permissive for update to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shops.id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ))
  with check (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shops.id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));
