-- Link directo al formulario de reseñas de Google de cada local.
-- El owner lo configura en Dashboard > Negocio (Redes sociales) y se usa en la
-- pantalla de confirmacion de reserva con el boton "Calificanos".
-- Formato esperado: https://search.google.com/local/writereview?placeid=XXXX
alter table public.shops
  add column if not exists google_review_url text;
