-- Repair: the deployed DB was created with an earlier version of 081 that used a
-- separate `store_products` table and `order_items.product_id -> store_products.id`.
-- The unified store schema (current 081) uses `stock` directly as the product table.
-- This migration migrates the legacy store catalog into `stock` and repoints the
-- foreign key, then drops the legacy table. Idempotent for fresh databases.

-- 1. Sync legacy store catalog into stock (linked rows) and create stock rows for
--    orphaned store products (no linked stock item).
do $$
begin
  if to_regclass('public.store_products') is not null then
    insert into public.stock (shop_id, nombre_producto, quantity, price, description, image_url, category, for_sale, visible, unit_cost)
    select sp.shop_id, sp.name, 0, coalesce(sp.price, 0), sp.description, sp.image_url, sp.category, sp.active, true, 0
    from public.store_products sp
    where sp.stock_id is null;

    update public.stock s
       set for_sale    = sp.active,
           nombre_producto = sp.name,
           price       = coalesce(sp.price, s.price),
           description = coalesce(sp.description, s.description),
           image_url   = coalesce(sp.image_url, s.image_url),
           category    = coalesce(sp.category, s.category),
           updated_at  = now()
      from public.store_products sp
     where sp.stock_id = s.id;
  end if;
end $$;

-- 2. Repoint order_items.product_id to stock(id).
alter table public.order_items
  drop constraint if exists order_items_product_id_fkey;

alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.stock (id) on delete set null;

-- 3. Drop the legacy table (removes its indexes/triggers/policies and the old FK).
drop table if exists public.store_products cascade;
