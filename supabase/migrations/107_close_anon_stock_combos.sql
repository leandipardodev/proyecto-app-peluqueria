-- 107: cerrar la lectura anon de stock y combos sin perder la capacidad publica
--
-- `npm run audit:rls` encontro 2 tablas con filas legibles con la anon key
-- (que viaja en el bundle del navegador):
--
--   stock  -> 59 filas. La politica stock_public_select (081:100) es
--             `for select to anon using (for_sale and visible)`. PostgREST
--             devuelve SELECT * por defecto, asi que ademas de nombre y precio
--             de venta exponia `unit_cost` (lo que el salon PAGA por el
--             producto) y `quantity` (stock actual del competidor). Ejemplo
--             real leido con la anon key: unit_cost 9000, quantity 4.
--   combos -> 11 filas, via combos_select_active (057:62).
--
-- Las dos politicas son leftovers: hoy NADIE lee esas tablas con la anon key.
-- Los unicos readers publicos usan service role y ya piden columnas seguras:
--   public-store-actions.ts:29-35  (stock, sin unit_cost)
--   public-booking-actions.ts:163  (combos, service role)
-- El resto de los 21 call sites son dashboard (JWT del usuario -> RLS por
-- membresia) o server actions.
--
-- En vez de borrar la capacidad publica, se reemplaza por vistas con columnas
-- curadas. Si alguna vez hace falta un read anon, se usa la vista; la tabla
-- base queda cerrada.

-- ---------------------------------------------------------------------------
-- 1. Cerrar la tabla base
-- ---------------------------------------------------------------------------
drop policy if exists "stock_public_select" on public.stock;
drop policy if exists "combos_select_active" on public.combos;

-- ---------------------------------------------------------------------------
-- 2. Vista publica de productos: sin unit_cost, sin quantity, sin shop_id
--    exposed. Solo lo que un cliente puede ver en la tienda.
-- ---------------------------------------------------------------------------
drop view if exists public.public_store_products;
create view public.public_store_products
with (security_invoker = false)
as
select
  s.id,
  s.shop_id,
  s.nombre_producto,
  s.description,
  s.price,
  s.image_url,
  s.category
from public.stock s
where s.for_sale = true
  and s.visible = true;

comment on view public.public_store_products is
  'Catalogo publico de productos. No expone unit_cost ni quantity. Usar en vez de stock para lecturas anon.';

-- ---------------------------------------------------------------------------
-- 3. Vista publica de combos: sin shop_id expuesto ni campos internos
-- ---------------------------------------------------------------------------
drop view if exists public.public_combos;
create view public.public_combos
with (security_invoker = false)
as
select
  c.id,
  c.shop_id,
  c.name,
  c.description,
  c.price,
  c.duration_minutes
from public.combos c
where c.active = true;

comment on view public.public_combos is
  'Combos activos publicos. Usar en vez de combos para lecturas anon.';

-- ---------------------------------------------------------------------------
-- 4. Permisos: anon puede leer las vistas, no las tablas
-- ---------------------------------------------------------------------------
revoke all on public.public_store_products from anon, authenticated;
revoke all on public.public_combos from anon, authenticated;

grant select on public.public_store_products to anon, authenticated;
grant select on public.public_combos to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PostgREST mantiene una cache del schema. Crear vistas/funciones desde el SQL
-- Editor no siempre dispara el reload, y hasta que ocurre `gen types` y el
-- propio PostgREST las ven como inexistentes (error PGRST205). Esto lo fuerza.
-- Tambien hace visibles las 4 funciones de helpers de la 105.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
