-- Fix multi-tenancy de clientes: cada local debe tener su propio customer.
-- Causa raiz: resolveCustomer y auth/callback creaban/reusaban customers con
-- id = user_id. Como id es PK global, un usuario logueado tenia 1 sola fila en
-- todo el sistema, de modo que al reservar en un segundo local los turnos de un
-- local quedaban apuntando a un customer que "vive" en otro shop ("Sin cliente").
-- A partir de aqui el codigo resuelve por (shop_id, telefono) y crea filas con
-- uuid generado; este cambio repara la fuga cross-shop existente y prohibe que
-- se repita (unique por shop + telefono).

-- 1) Reparar referencias cross-shop: si un customer tiene turnos en un shop
--    distinto del de su fila, crear un customer per-shop en ese shop (clonando
--    sus datos y reutilizando por telefono si ya existiera) y re-apuntar los
--    turnos/vouchers/orders de ESA shop al nuevo customer. Las filas de cada
--    shop quedan intactas y aisladas.
do $$
declare
  src record;
  cr public.customers%rowtype;
  dst uuid;
begin
  for src in
    select distinct a.customer_id as old_id, a.shop_id as fshop
    from public.appointments a
    join public.customers c on c.id = a.customer_id
    where a.customer_id is not null
      and a.shop_id <> c.shop_id
  loop
    select * into cr from public.customers where id = src.old_id;
    if cr is null then continue; end if;

    -- Reutilizar un customer existente de esa shop con el mismo telefono.
    select c.id into dst
    from public.customers c
    where c.shop_id = src.fshop
      and c.telefono is not distinct from cr.telefono
    limit 1;

    if dst is null then
      insert into public.customers (shop_id, user_id, nombre, email, telefono, created_at)
      values (src.fshop, cr.user_id, cr.nombre, cr.email, cr.telefono, cr.created_at)
      returning id into dst;
    end if;

    update public.appointments
    set customer_id = dst
    where customer_id = src.old_id and shop_id = src.fshop;

    update public.vouchers
    set customer_id = dst
    where customer_id = src.old_id and shop_id = src.fshop;

    update public.orders
    set customer_id = dst
    where customer_id = src.old_id and shop_id = src.fshop;
  end loop;
end $$;

-- 2) Prohibir duplicados futuros de telefono dentro de cada local.
--    Verificado: no existen duplicados (shop_id, telefono) en la DB actual.
create unique index if not exists unique_customer_phone_per_shop
  on public.customers (shop_id, telefono)
  where telefono is not null;

-- 3) Indice (no unico) para resolver un customer logueado dentro de un local.
create index if not exists idx_customers_shop_user
  on public.customers (shop_id, user_id);
