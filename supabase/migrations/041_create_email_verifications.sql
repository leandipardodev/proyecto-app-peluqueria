-- Tabla para códigos de verificación de email (Registro propio vía Resend)
create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);

create index if not exists email_verifications_email_idx on public.email_verifications (email);
create index if not exists email_verifications_code_idx on public.email_verifications (code);

-- Nota: service_role accede por defecto, no necesita RLS explícito
-- Los códigos expirados se limpian desde el panel de Supabase o una función a programar
