-- Fix shops DELETE RLS: staff role was able to delete the shop because
-- "shops_membership_access" is "for all" and DELETE only evaluates USING,
-- not WITH CHECK. Add a restrictive DELETE policy that requires owner/admin.
--
-- PostgreSQL: permissive + restrictive policies are AND-ed.
-- The existing permissive policy allows any member, this restrictive
-- policy further restricts DELETE to only owner/admin.

drop policy if exists "shops_delete_owner_admin_only" on public.shops;
create policy "shops_delete_owner_admin_only" on public.shops
  as restrictive for delete to authenticated
  using (exists (
    select 1 from public.shop_memberships sm
    where sm.shop_id = shops.id and sm.user_id = auth.uid() and sm.is_active = true
      and sm.role = any (array['owner'::text, 'admin'::text])
  ));
