-- Per-shop feature overrides: permite que un local active features
-- deshabilitadas a nivel rubro
alter table public.shops
add column if not exists features_override jsonb;

comment on column public.shops.features_override is 'Ej: {"inventory": true} — solo permite activar features, no desactivar las que ya estan activas por rubro';
