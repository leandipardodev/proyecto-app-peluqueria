-- Align the live DB with the unified store schema (081/082) and the generated types.
-- The deployed DB inherited `product_id NOT NULL` from the legacy store schema, but the
-- FK is `on delete set null`: deleting a product referenced by order_items tried to set
-- NULL and failed with a not-null violation. Idempotent.
alter table public.order_items
  alter column product_id drop not null;
