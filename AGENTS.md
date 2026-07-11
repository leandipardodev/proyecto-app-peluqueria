# AGENTS.md

## What this is

Klip — SaaS for hair salons/barbershops. Booking, admin dashboard, payments (Mercado Pago), inventory, finance. Single Next.js app (not a monorepo).

## Commands

```bash
npm run dev              # Next.js dev server (Turbopack)
npm run build            # Production build (use to verify before committing)
npm run lint             # ESLint (flat config)
npm run test             # Vitest unit tests (single run)
npm run test:watch       # Vitest watch mode
npm run test:e2e         # Playwright E2E (starts dev server automatically if not CI)
npm run test:e2e:ui      # Playwright UI mode
```

Verify order before committing: `lint` then `build`. Tests are separate.

### Audit / utility scripts

```bash
npm run audit:rls              # Audit Supabase RLS policies
npm run audit:gains-cash       # Cash audit
npm run perf:budget            # Performance budget check
npm run perf:budget:auth       # Auth performance budget
```

### Supabase

```bash
npm run supabase:gen-types     # Regenerate src/lib/supabase/database.types.ts
npx supabase db push           # Apply migrations from supabase/migrations/
```

## Architecture

- **Next.js 16 App Router** with Server Actions, React 19, TypeScript strict
- **Supabase** (PostgreSQL + RLS) for DB and auth (email + Google OAuth)
- **Mercado Pago** for payments (checkout, webhooks, OAuth per shop)
- **Resend** for transactional emails
- **Sentry** for error tracking (client + server + edge)
- **PWA** enabled in production via `@ducanh2912/next-pwa`

### Routing

- `/book/[slug]` — Public booking wizard (no auth)
- `/dashboard/[shopSlug]/*` — Multi-tenant admin (auth required)
- `/admin/*` — Super admin (platform_role check)
- `/api/payments/mercadopago-webhook` — MP webhook endpoint
- `/api/cron/*` — Vercel cron jobs (billing expiry + dunning)

### Multi-tenancy

Shop isolation via `shop_memberships` table + Supabase RLS. The middleware (`middleware.ts`) resolves the active shop from URL slug → cookies → first membership, and injects `x-shop-id` / `x-shop-slug` headers. Server code reads shop ID via `requireShopId()` or `getShopId()` from `@/lib/dashboard/auth/server`.

**Legacy paths**: `/dashboard/appointments`, `/dashboard/customers`, etc. (without slug) are redirected by middleware to `/dashboard/[preferredSlug]/...`. The set of legacy segment names is in `src/lib/dashboard/shared/legacy-segments.ts`.

### Dashboard revalidation

`revalidateDashboardSegments` is intentionally a **no-op**. Mutations update client state directly; Supabase Realtime handles live updates. Do not add `revalidatePath` calls to server actions — it causes full layout re-renders.

## Key files

- `src/lib/env.ts` — Required env var validation (throws in production)
- `src/lib/dashboard/auth/server.ts` — Auth helpers: `requireShopId()`, `requireOwnerShopId()`, `createServiceRoleClient()`, `getShopId()`
- `src/lib/supabase/server.ts` — Server-side Supabase client (cookie-based SSR)
- `src/lib/supabase/middleware.ts` — Middleware Supabase client
- `src/lib/supabase/database.types.ts` — **Auto-generated** — do not edit manually. Regenerate with `npm run supabase:gen-types`. Excluded from tsconfig and ESLint.
- `src/lib/rate-limiter.ts` — Upstash in production, in-memory fallback (not multi-instance safe)
- `src/lib/argentina-time.ts` — All time logic uses Argentina timezone (ART, UTC-3)
- `src/lib/billing/plans.ts` — Billing plan config (monthly, 25000 ARS)
- `middleware.ts` — Root middleware: auth, shop resolution, legacy redirects, plan expiry checks

## Testing

### Vitest

- Config: `vitest.config.ts`
- Setup file: `src/__tests__/setup.ts` — pre-mocks Supabase client, `next/navigation`, `next/cache`, `next/headers`, `server-only`, dashboard auth, retry, argentina-time, analytics, email
- Test files: `src/__tests__/*.test.ts`
- `server-only` package is mocked via `src/__tests__/mocks/server-only.ts`
- Helper functions: `chainableQuery()`, `supabaseStub()`, `makeOwnerCheckClient()`, `mockQueryResult()` — use these instead of re-mocking Supabase from scratch
- Tests use `vitest` globals (no need to import `describe`/`it`/`expect`)

### Playwright

- Config: `playwright.config.ts`
- Tests: `e2e/` directory
- Runs against `http://localhost:3000` (auto-starts dev server locally)
- Only Chromium project configured
- Needs real env vars for E2E (Supabase, etc.)

## Conventions

- **ESM** (`"type": "module"` in package.json)
- **Path alias**: `@/*` → `./src/*`
- **Tailwind CSS v4** via PostCSS plugin (`@tailwindcss/postcss`). Dark mode uses `.dark` class with custom variant in `globals.css`
- **CSS variables** for theming: `--ui-bg`, `--ui-surface`, `--ui-primary`, etc.
- **`cn()` utility** from `@/lib/utils` for merging Tailwind classes
- **Server Actions** for mutations — return `ActionResult<T>` type (`{ success: true, data: T }` or `{ success: false, error: string }`)
- **Pre-commit**: Husky + lint-staged runs `eslint --fix` and `tsc --noEmit` on staged `.ts/.tsx` files
- **Body size limit**: 6MB for server actions (configured in `next.config.mjs`)
- **Argentine Spanish** for user-facing text and code comments

## Environment

Critical env vars (see `.env.example` for full list):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `NEXT_PUBLIC_MP_PUBLIC_KEY`
- `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET`, `MP_OAUTH_STATE_SECRET`
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_URL`

Optional but important: `UPSTASH_REDIS_REST_URL`/`TOKEN` (rate limiting), `RESEND_API_KEY` (emails), `CRON_SECRET` (cron auth), `STAFF_INVITE_SECRET`.

## Gotchas

- `database.types.ts` is generated — never hand-edit. It's excluded from tsconfig includes and ESLint ignores.
- In-memory rate limiter doesn't work across Vercel serverless instances — set Upstash vars for production.
- `revalidateDashboardSegments` is a no-op — do not call `revalidatePath` in dashboard server actions.
- `createServiceRoleClient()` bypasses RLS — only use server-side, never expose the key to the client.
- PWA service worker is disabled in development, enabled in production.
- The `server-only` import is mocked in tests — if you add new `server-only` imports, they'll work in tests automatically.
- Middleware swallows errors and allows requests through (safety fallback) — check middleware logs if auth/routing seems broken.
- Argentina timezone is hardcoded throughout — all date logic goes through `src/lib/argentina-time.ts`.
