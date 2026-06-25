-- The CHECK constraint shop_booking_theme_template_id_check only allowed 4 template IDs,
-- blocking the 20 skins now defined in BOOKING_TEMPLATE_PRESETS.
-- Validation is handled at the application layer by normalizeTemplateId() and
-- BookingTemplateId union type, so a DB-level constraint is redundant and fragile.

alter table if exists public.shop_booking_theme
  drop constraint if exists shop_booking_theme_template_id_check;
