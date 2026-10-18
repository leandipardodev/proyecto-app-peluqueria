-- 114: el local decide si la tienda aparece como un paso mas del flujo de
-- reserva (/book) o si solo se accede desde el boton "Tienda".
--
--   true  = la tienda es un paso mas, antes de pagar (comportamiento historico)
--   false = la tienda no se muestra como paso; el cliente entra por el boton
--
-- default true a proposito: los locales que ya existen la mostraban como paso.
-- Con default false se les sacaria a todos en el momento del deploy.
--
-- Requiere que la tienda online este activa (features.store). Si el local no
-- tiene servicios y vende solo productos, el paso se fuerza visible igual:
-- sin el, el flujo de reserva quedaria vacio.
alter table shops
  add column if not exists show_store_step boolean not null default true;

comment on column shops.show_store_step is
  'true = la tienda es un paso del flujo de reserva. false = solo se accede desde el boton Tienda. Se ignora si el local no tiene servicios.';
