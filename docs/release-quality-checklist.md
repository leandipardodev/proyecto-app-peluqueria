# Release Quality Checklist

## 1) Before each deploy

- Run `npm run lint`
- Run `npm run build`
- Run `npm run test:e2e`
- Verify OAuth login (Google) in browser
- Verify create appointment flow (manual)
- Verify payment link generation

## 2) Sentry setup

Create a Sentry project (Next.js) and configure these env vars:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

Notes:

- `NEXT_PUBLIC_SENTRY_DSN` enables runtime error capture.
- `SENTRY_AUTH_TOKEN` is used for sourcemap upload during build.

## 3) E2E setup

Optional authenticated flow variables:

- `E2E_LOGIN_EMAIL`
- `E2E_LOGIN_PASSWORD`
- `PLAYWRIGHT_BASE_URL` (default: `http://localhost:3000`)

If login credentials are missing, authenticated tests are skipped automatically.

Recommended seed data for full critical coverage:

- At least 1 customer
- At least 1 service
- At least 1 unpaid appointment (to validate payment-link flow)

## 4) Rollback plan

- Keep previous production build tag ready.
- If critical flow fails after deploy, rollback immediately.
- Check Sentry issues in the first 30 minutes post-release.

## 5) OAuth Google QA strategy

- Use a dedicated QA Google account (never personal owner account).
- Validate both flows:
  - Login from `/login`
  - Register from `/register`
- Confirm callback behavior in each environment:
  - Local: `http://localhost:3000/auth/callback`
  - Production: `https://klip.com.ar/auth/callback`
- Run test in clean browser context (incognito) to avoid stale cookies.
- Success criteria:
  - User lands on dashboard (not blocked by admin guard)
  - No redirect loop
  - Session is available after callback
