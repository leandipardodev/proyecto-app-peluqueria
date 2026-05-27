# Core Web Vitals Baseline

Fecha: 2026-05-26
Entorno: local (`npm run dev`, Lighthouse CLI, Chromium headless)

## Rutas medidas

- `/`
- `/login`
- `/dashboard`
- `/dashboard/business`

## Resultados (baseline)

| Ruta | Performance | FCP (ms) | LCP (ms) | CLS | INP (ms) | TBT (ms) | Estado |
|---|---:|---:|---:|---:|---:|---:|---|
| `/` | 43 | 1480 | 8576 | 0.000 | 0 | 3716 | OK |
| `/login` | 47 | 1005 | 10426 | 0.000 | 0 | 2214 | OK |
| `/dashboard` | 0 | 0 | 0 | 0.000 | 0 | 0 | Error 500 |
| `/dashboard/business` | 0 | 0 | 0 | 0.000 | 0 | 0 | Error 500 |

## Observaciones

- En local, las rutas de dashboard devolvieron `ERRORED_DOCUMENT_REQUEST` con status `500` durante Lighthouse.
- Se instrumentó captura de Web Vitals por ruta en runtime:
  - cliente: `src/components/perf/web-vitals-reporter.tsx`
  - endpoint: `src/app/api/perf/web-vitals/route.ts`
- Para CI se configuró presupuesto inicial sobre rutas públicas estables (`/`, `/login`, `/register`) para evitar falsos negativos por autenticación/configuración de entorno.

## Presupuesto CI inicial

- `Performance score >= 0.35`
- `LCP <= 12000ms`
- `CLS <= 0.1`
- `TBT <= 5000ms`

## Presupuesto CI autenticado (dashboard)

- Script: `npm run perf:budget:auth`
- Rutas: `/dashboard`, `/dashboard/calendar`, `/dashboard/business`
- Se ejecuta en CI solo si existen secrets:
  - `E2E_LOGIN_EMAIL`
  - `E2E_LOGIN_PASSWORD`
- Umbrales iniciales:
  - `Performance score >= 0.25`
  - `LCP <= 14000ms`
  - `CLS <= 0.15`
  - `TBT <= 7000ms`

Implementación:

- script: `scripts/perf-budget-check.mjs`
- npm: `npm run perf:budget`
- workflow: `.github/workflows/quality-gate.yml`

## Próximo ajuste recomendado

- Medir dashboard autenticado con sesión de prueba en CI (Playwright + Lighthouse) y mover el presupuesto desde rutas públicas a rutas clave del producto autenticado.

Estado: implementado en `.github/workflows/quality-gate.yml` con ejecución condicional por secrets.
