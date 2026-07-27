# Guía de Variables de Entorno — Klip

> Cada variable, qué hace, dónde conseguirla, y qué se rompe si falta.

---

## OBLIGATORIAS (sin estas, la app no funciona)

### Supabase

| Variable | Dónde conseguirla | Qué se rompe si falta |
|----------|-------------------|----------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | Toda la app. No hay base de datos ni auth. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | Login no funciona. Client-side queries fallan. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role secret | Server actions no pueden escribir en DB. Admin operations fallan. **NUNCA exponer en el cliente.** |

### Mercado Pago

| Variable | Dónde conseguirla | Qué se rompe si falta |
|----------|-------------------|----------------------|
| `MP_ACCESS_TOKEN` | MP → Developers → Credentials → Access Token | Pagos no se procesan. Webhook falla. Checkout no crea preferencias. |
| `MP_WEBHOOK_SECRET` | MP → Tu negocio → Webhooks → Secret | Webhook rechaza todos los pagos con "invalid signature". **No cobrás nada.** |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | MP → Developers → Credentials → Public Key | Widget de checkout no carga en el navegador. Clientes no pueden pagar. |
| `MP_OAUTH_CLIENT_ID` | MP → Developers → Credentials → Client ID | OAuth flow para shops no funciona. Shops no pueden conectar su cuenta MP. |
| `MP_OAUTH_CLIENT_SECRET` | MP → Developers → Credentials → Client Secret | OAuth flow falla al intercambiar código por token. |
| `MP_OAUTH_STATE_SECRET` | Generar con: `openssl rand -hex 32` | OAuth state parameter no se verifica. Vulnerabilidad CSRF. |

### URLs

| Variable | Dónde conseguirla | Qué se rompe si falta |
|----------|-------------------|----------------------|
| `NEXT_PUBLIC_SITE_URL` | Tu dominio (ej: https://klip.com.ar) | Links en emails y redirect URLs son incorrectos. |
| `NEXT_PUBLIC_BASE_URL` | Tu dominio (igual que SITE_URL normalmente) | API calls internos fallan. Webhook URLs incorrectos. |

---

## OPCIONALES (la app funciona pero con funcionalidad reducida)

### Email

| Variable | Dónde conseguirla | Qué se pierde si falta |
|----------|-------------------|----------------------|
| `RESEND_API_KEY` | Resend → API Keys → Create | No se envían emails: confirmaciones de turno, dunning, verificación de email. |
| `RESEND_FROM_EMAIL` | Resend → Domains → Tu dominio verificado | Emails se envían desde dirección por defecto de Resend (no recomendado). |

### Rate Limiting

| Variable | Dónde conseguirla | Qué se pierde si falta |
|----------|-------------------|----------------------|
| `UPSTASH_REDIS_REST_URL` | Upstash → Console → Tu database → REST URL | Rate limiting cae a in-memory (no funciona en Vercel multi-instance). Webhooks pueden ser spameados. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash → Console → Tu database → REST Token | Mismo que arriba. |

### Seguridad

| Variable | Dónde conseguirla | Qué se pierde si falta |
|----------|-------------------|----------------------|
| `STAFF_INVITE_SECRET` | Generar con: `openssl rand -hex 32` | Staff invite links no funcionan. |
| `CRON_SECRET` | Generar con: `openssl rand -hex 32` | Cron jobs no se autentican. Billing expiry y dunning no corren. |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA → Admin Console | reCAPTCHA no verifica. Bookings públicos son vulnerables a bots. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Google reCAPTCHA → Admin Console | Widget reCAPTCHA no aparece en el formulario de booking. |

### Monitoring

| Variable | Dónde conseguirla | Qué se pierde si falta |
|----------|-------------------|----------------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project Settings → Client Keys (DSN) | No se reportan errores al cliente. Solo server errors se reportan (si están configurados). |
| `SENTRY_ORG` | Sentry → Organization Settings | Source maps no se suben. Errores en Sentry muestran código minificado. |
| `SENTRY_PROJECT` | Sentry → Project Settings | Source maps no se suben. |
| `SENTRY_AUTH_TOKEN` | Sentry → Auth Tokens → Create | Source maps no se suben. |

---

## Dónde configurarlas

### En desarrollo (local):
1. Crear archivo `.env.local` en la raíz del proyecto
2. Copiar el formato de `.env.example` si existe
3. **NUNCA commitear `.env.local` a git**

### En producción (Vercel):
1. Vercel → Tu proyecto → Settings → Environment Variables
2. Agregar cada variable para el entorno correcto (Production, Preview, Development)
3. **Production** = tu dominio principal
4. **Preview** = deploy previews de PRs
5. **Development** = `npm run dev` local

### Verificar que están configuradas:
```bash
# La app valida al iniciar (ver src/lib/env.ts)
# En producción, lanza error si falta una required
# En desarrollo, solo imprime warning
```

---

## Generar secrets seguros

```bash
# En terminal (Mac/Linux/Windows Git Bash):
openssl rand -hex 32

# En PowerShell:
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

---

## Seguridad: qué NUNCA hacer

1. **NUNCA** commitear `.env.local` o `.env` a git
2. **NUNCA** exponer `SUPABASE_SERVICE_ROLE_KEY` en el cliente (solo usar en server actions)
3. **NUNCA** exponer `MP_ACCESS_TOKEN` en el cliente
4. **NUNCA** usar el mismo secret para `MP_WEBHOOK_SECRET` y `CRON_SECRET`
5. **NUNCA** hardcodear keys en archivos `.tsx` o `.ts` que se envían al navegador
6. **NUNCA** usar `NEXT_PUBLIC_` en variables que contengan secrets

---

## Checklist de variables para un nuevo deploy

```
[ ] NEXT_PUBLIC_SUPABASE_URL
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] NEXT_PUBLIC_SITE_URL
[ ] NEXT_PUBLIC_BASE_URL
[ ] MP_ACCESS_TOKEN
[ ] MP_WEBHOOK_SECRET
[ ] NEXT_PUBLIC_MP_PUBLIC_KEY
[ ] MP_OAUTH_CLIENT_ID
[ ] MP_OAUTH_CLIENT_SECRET
[ ] MP_OAUTH_STATE_SECRET
[ ] RESEND_API_KEY (opcional)
[ ] RESEND_FROM_EMAIL (opcional)
[ ] CRON_SECRET (necesario para crons)
[ ] STAFF_INVITE_SECRET (necesario para invites)
[ ] UPSTASH_REDIS_REST_URL (recomendado)
[ ] UPSTASH_REDIS_REST_TOKEN (recomendado)
[ ] NEXT_PUBLIC_SENTRY_DSN (recomendado)
[ ] RECAPTCHA_SECRET_KEY (recomendado)
[ ] NEXT_PUBLIC_RECAPTCHA_SITE_KEY (recomendado)
```
