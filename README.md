# Klip — Booking + Gestión + Cobros

SaaS de gestión para peluquerías y barberías. Booking online, dashboard administrativo, pagos con Mercado Pago, inventario, finanzas y más.

## Stack

- **Framework:** Next.js 16 (App Router, Server Actions, SSR)
- **UI:** React 19, Tailwind CSS 4, Framer Motion, Recharts
- **Base de datos:** Supabase (PostgreSQL) con RLS multi-tenant
- **Autenticación:** Supabase Auth (email + Google OAuth)
- **Pagos:** Mercado Pago (checkout, webhooks, OAuth por local)
- **Email:** Resend (confirmaciones, recordatorios)
- **Monitoreo:** Sentry (client + server + edge)
- **Testing:** Vitest (unitarios) + Playwright (E2E)
- **CI:** GitHub Actions (lint, build, perf budget, E2E)

## Requisitos

- Node.js 22+
- npm
- Cuenta de Supabase
- Cuenta de Mercado Pago (vendedor)
- API key de Resend
- Cuenta de Sentry (opcional)

## Instalación

```bash
# Clonar el repo
git clone <repo-url>
cd proyecto-app-peluqueria

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env.local
# Completar .env.local con tus credenciales
```

## Variables de entorno

Ver `.env.example` para la lista completa. Las críticas son:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (solo server-side) |
| `MP_ACCESS_TOKEN` | Access token de Mercado Pago |
| `MP_WEBHOOK_SECRET` | Secreto para verificar webhooks HMAC |
| `RESEND_API_KEY` | API key de Resend para emails |
| `CRON_SECRET` | Secreto para proteger endpoints cron |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | Public key de Mercado Pago (frontend) |

## Desarrollo

```bash
npm run dev          # Iniciar servidor de desarrollo
npm run test         # Tests unitarios (Vitest)
npm run test:watch   # Tests en modo watch
npm run test:e2e     # Tests E2E (Playwright)
npm run lint         # ESLint
npm run build        # Build de producción
```

## Base de datos

Las migraciones están en `supabase/migrations/`. Aplicar con:

```bash
npx supabase db push
```

Si ya tenés una base de datos existente, podés migrar manualmente los cambios incrementales desde `supabase/migrations/`.

## Despliegue

Optimizado para Vercel:

1. Conectar repo a Vercel
2. Configurar todas las variables de entorno
3. Configurar dominio personalizado
4. Configurar webhook de MP apuntando a `/api/payments/mercadopago-webhook`
5. Configurar cron job de billing en Vercel Cron Jobs

## Scripts útiles

```bash
npm run audit:rls           # Auditar políticas RLS
npm run audit:gains-cash    # Auditoría de caja
npm run perf:budget         # Budget de performance
```

## Arquitectura

- **Booking público:** `/book/[slug]` — wizard multi-step sin autenticación
- **Dashboard:** `/dashboard/[shopSlug]/*` — multi-tenant por slug
- **Pagos:** Webhook MP con verificación HMAC, idempotencia por unique constraint
- **Multi-local:** Aislamiento por RLS via `shop_memberships`

## Licencia

Propietaria. Todos los derechos reservados.
