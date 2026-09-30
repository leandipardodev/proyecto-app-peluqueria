-- 106: contador de intentos para los codigos de verificacion de email
--
-- verifyEmailCode no tenia ningun limite de intentos: MAX_ATTEMPTS era un
-- .limit(5) sobre la QUERY (cuantos codigos pendientes leer), no un contador
-- de intentos. Con un espacio de 10^6 y ventana de 15 min, un atacante podia
-- barrer los valores contra completeRegistration(), que termina haciendo
-- signInWithPassword con la contraseña elegida por el atacante -> toma de cuenta.

alter table public.email_verifications
  add column if not exists attempts integer not null default 0;

-- Dedupe ANTES de crear el indice: si un email tiene varios codigos sin
-- verificar, el CREATE UNIQUE abortaria la migracion entera.
delete from public.email_verifications a
using public.email_verifications b
where a.email = b.email
  and a.verified_at is null
  and b.verified_at is null
  and (a.created_at, a.id) > (b.created_at, b.id);

-- Un unico codigo vigente por email. Asi el codigo nuevo (resend) invalida el
-- anterior en vez de multiplicar el espacio de busqueda, y sendVerificationCode
-- puede hacer upsert en vez de acumular filas.
create unique index if not exists idx_email_verifications_email_pending
  on public.email_verifications (email)
  where verified_at is null;
