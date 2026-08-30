-- ============================================================
-- Klip: configuracion de tienda "klop" — SOLO para esa tienda
-- Ejecutar en el SQL Editor de Supabase.
-- Idempotente: se puede correr de nuevo sin duplicar.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Extender plan a 15 dias desde la fecha actual
-- Sobre escribe plan_expiry. Si plan_expiry es nulo tambien lo setea.
-- ------------------------------------------------------------
UPDATE public.shops
SET plan_expiry = now() + interval '15 days',
    updated_at  = now()
WHERE slug = 'klop';

-- Verificacion del plan (incluye active: si active=false sigue bloqueada)
SELECT slug, active, plan_expiry, now() AS hoy
FROM public.shops
WHERE slug = 'klop';

-- ------------------------------------------------------------
-- 2) Servicios de odontologia (precios tipicos ARS).
-- Solo se insertan si no existe ya el servicio con ese nombre
-- en la tienda klop, para no duplicar al re-ejecutar.
-- ------------------------------------------------------------
INSERT INTO public.services (shop_id, name, price, duration_minutes, category, description)
SELECT
  s.id,
  v.name,
  v.price,
  v.duration_minutes,
  v.category,
  v.description
FROM public.shops s
CROSS JOIN (VALUES
  ('Consulta odontologica',         20000,  30, 'Consulta', 'Evaluacion general y diagnostico'),
  ('Resolucion de urgencia',        15000,  20, 'Consulta', 'Atencion inmediata de dolor o emergencia'),
  ('Limpieza dental (profilaxis)',  25000,  45, 'Higiene',  'Destartraje y pulido'),
  ('Radiografia periapical',         8000,  20, 'Diagnostico', 'Placa radiografica'),
  ('Radiografia panoramica',        20000,  20, 'Diagnostico', 'Panoramica digital'),
  ('Empaste (obturacion)',          35000,  45, 'Restauracion', 'Restauracion directa con composite'),
  ('Extraccion simple',             30000,  30, 'Cirugia',  'Extraccion de pieza dental'),
  ('Extraccion de muela del juicio',60000,  60, 'Cirugia',  'Cirugia de tercer molar'),
  ('Endodoncia',                   120000,  90, 'Endodoncia', 'Tratamiento de conducto por pieza'),
  ('Corona de porcelana',          150000,  60, 'Protesis',  'Corona o funda, por unidad'),
  ('Blanqueamiento dental',         90000,  60, 'Estetica',  'Blanqueamiento de ambas arcadas'),
  ('Revision de ortodoncia',        25000,  30, 'Ortodoncia', 'Control de alineadores o brackets'),
  ('Colocacion de implante',       350000,  90, 'Cirugia',  'Implante dental, por unidad')
) AS v(name, price, duration_minutes, category, description)
WHERE s.slug = 'klop'
  AND NOT EXISTS (
    SELECT 1 FROM public.services sv
    WHERE sv.shop_id = s.id AND sv.name = v.name
  );

-- Verificacion de servicios insertados para klop
SELECT sv.id, sv.name, sv.price, sv.duration_minutes, sv.category
FROM public.services sv
JOIN public.shops s ON s.id = sv.shop_id
WHERE s.slug = 'klop'
ORDER BY sv.name;

-- ------------------------------------------------------------
-- 3) Horarios del consultorio (Lun-Jue 9-19, Vie 9-15, fin de semana cerrado)
-- ------------------------------------------------------------
UPDATE public.shops
SET business_hours = '{
  "monday":    { "open": true,  "start": "09:00", "end": "19:00" },
  "tuesday":   { "open": true,  "start": "09:00", "end": "19:00" },
  "wednesday": { "open": true,  "start": "09:00", "end": "19:00" },
  "thursday":  { "open": true,  "start": "09:00", "end": "19:00" },
  "friday":    { "open": true,  "start": "09:00", "end": "15:00" },
  "saturday":  { "open": false, "start": "09:00", "end": "14:00" },
  "sunday":    { "open": false, "start": "09:00", "end": "14:00" }
}'::jsonb,
    updated_at = now()
WHERE slug = 'klop';

-- Verificacion de horarios
SELECT slug, business_hours
FROM public.shops
WHERE slug = 'klop';
