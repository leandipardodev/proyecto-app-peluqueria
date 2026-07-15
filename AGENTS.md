# AGENTS.md

Klip — SaaS for hair salons/barbershops. Next.js 16 App Router, React 19, TypeScript strict, Supabase, Mercado Pago, Resend, Sentry, PWA.

## Commands

```bash
npm run dev                # Dev server (Turbopack)
npm run build              # Production build
npm run lint               # ESLint
npm run test               # Vitest
npm run test:watch         # Vitest watch
npm run test:e2e           # Playwright E2E
npm run supabase:gen-types # Regenerate database.types.ts
```

Pre-commit: `lint` then `build`.

## Routing

- `/book/[slug]` — Public booking (no auth)
- `/dashboard/[shopSlug]/*` — Multi-tenant admin (auth)
- `/admin/*` — Super admin
- `/api/payments/mercadopago-webhook` — MP webhook
- `/api/cron/*` — Vercel cron jobs

## Multi-tenancy

Shop isolation via `shop_memberships` + RLS. Middleware resolves shop from URL → cookies → first membership, injects `x-shop-id`/`x-shop-slug`. Server: `requireShopId()` / `getShopId()` from `@/lib/dashboard/auth/server`. Legacy paths (`/dashboard/appointments` without slug) auto-redirect.

`revalidateDashboardSegments` is a **no-op** — do not add `revalidatePath` in server actions.

## Key files

- `src/lib/env.ts` — Env var validation
- `src/lib/dashboard/auth/server.ts` — `requireShopId()`, `requireOwnerShopId()`, `createServiceRoleClient()`, `getShopId()`
- `src/lib/supabase/server.ts` — Server Supabase client
- `src/lib/supabase/database.types.ts` — **Auto-generated**. Never edit. Regen: `npm run supabase:gen-types`
- `src/lib/argentina-time.ts` — All time logic (ART, UTC-3)
- `src/lib/billing/plans.ts` — Billing config (monthly, 25000 ARS)
- `middleware.ts` — Auth, shop resolution, legacy redirects, plan expiry

## Conventions

- ESM, path alias `@/*` → `./src/*`
- Tailwind v4 (PostCSS). Dark mode: `.dark` class
- CSS vars: `--ui-bg`, `--ui-surface`, `--ui-primary`
- `cn()` from `@/lib/utils`
- Server Actions → `ActionResult<T>`
- Argentine Spanish for UI text

## Gotchas

- `database.types.ts` is generated — never hand-edit
- In-memory rate limiter not safe across Vercel instances — use Upstash
- `createServiceRoleClient()` bypasses RLS — server-only, never expose key
- PWA SW disabled in dev, enabled in prod
- `server-only` mocked in tests automatically
- Middleware swallows errors (allows requests through) — check logs if auth seems broken
- Argentina timezone hardcoded — all through `argentina-time.ts`

## Env vars

Critical: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `NEXT_PUBLIC_MP_PUBLIC_KEY`, `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET`, `MP_OAUTH_STATE_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_URL`

Optional: `UPSTASH_REDIS_REST_URL`/`TOKEN`, `RESEND_API_KEY`, `CRON_SECRET`, `STAFF_INVITE_SECRET`

## Testing

Vitest: `src/__tests__/*.test.ts`, setup: `src/__tests__/setup.ts`, helpers: `chainableQuery()`, `supabaseStub()`, `makeOwnerCheckClient()`, `mockQueryResult()`. Uses vitest globals. Config: `vitest.config.ts`.

Playwright: `e2e/` dir, Chromium only, needs real env vars. Config: `playwright.config.ts`.

## Agent rules

- Run `npx tsc --noEmit` + `npx eslint <changed-files>` after every edit. Don't wait to be asked.
- Read ≥30 lines of context before editing.
- Lint → tsc before reporting done.
- Don't ask what's here — reference this file.
- Be concise. No preamble, no summary unless asked.
- Skip todo lists for 1-2 step tasks.
- Use Task tool for exploration (keeps context separate).
- Use offset/limit on reads, specific grep patterns.
