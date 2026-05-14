begin;

drop policy if exists shops_select_own on public.shops;
drop policy if exists shops_update_own on public.shops;

create policy shops_select_own
on public.shops
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = shops.id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  )
);

create policy shops_update_own
on public.shops
for update
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = shops.id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = shops.id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

commit;
