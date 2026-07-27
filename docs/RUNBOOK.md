# Runbook de Emergencia — Klip

> Guía paso a paso para resolver los problemas más comunes.
> Si no sabés hacer algo de esta lista, buscá en la sección "Archivos relevantes" de cada escenario.

---

## 1. "Nadie puede entrar al dashboard"

**Síntomas:** Usuarios ven pantalla de login o error "Shop ID no disponible"

### Causa probable: Middleware de auth fallando

1. Abrir Sentry → buscar errores recientes en `middleware.ts`
2. Verificar que `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` estén configurados
3. Verificar que `SUPABASE_SERVICE_ROLE_KEY` esté configurado
4. Verificar que la tabla `shop_memberships` tenga registros activos para el usuario

### Si es un usuario específico:
1. Verificar `shop_memberships` → `user_id` coincide con el usuario
2. Verificar `is_active = true`
3. Verificar `role` es válido (owner/admin/staff)

### Si es todos los usuarios:
1. Verificar Supabase status: https://status.supabase.com
2. Verificar Vercel status: https://www.vercel-status.com
3. Revisar logs recientes en Vercel dashboard

**Archivos relevantes:**
- `middleware.ts` (línea 21: error swallowing — si falla, deja pasar pero sin auth)
- `src/lib/dashboard/auth/server.ts`
- `src/lib/supabase/server.ts`

---

## 2. "El webhook de Mercado Pago dejó de funcionar"

**Síntomas:** Pagos en MP se ven como aprobados pero el turno no se crea / la suscripción no se renueva

### Causa probable: Firma HMAC o cambio en API de MP

1. Verificar Sentry → buscar errores en `/api/payments/mercadopago-webhook`
2. Si ves "invalid signature":
   - Verificar que `MP_WEBHOOK_SECRET` en env coincida con el configurado en MP dashboard
   - MP puede haber rotado el secret → regenerar en MP dashboard
3. Si ves "Shop Mercado Pago token missing":
   - El shop perdió su `mp_access_token` → re-conectar desde el dashboard

### Verificar manualmente:
```bash
# Testear que el endpoint responde
curl https://tudominio.com/api/payments/mercadopago-webhook
# Debe retornar: {"ok":true}
```

### Si MP cambió su API:
1. Buscar "Mercado Pago API changelog" en Google
2. Verificar si cambiaron el formato de `x-signature`
3. Verificar si cambiaron los campos de `subscription_preapproval` o `subscription_charged`

**Archivos relevantes:**
- `src/app/api/payments/mercadopago-webhook/route.ts`
- `src/lib/payments/mercadopago-actions.ts`
- Variable: `MP_WEBHOOK_SECRET`

---

## 3. "Los emails no se envían"

**Síntomas:** Clientes no reciben confirmación de turno, owners no reciben dunning emails

### Causa probable: API key de Resend vencida o dominio no verificado

1. Verificar Sentry → buscar errores de fetch a `api.resend.com`
2. Verificar `RESEND_API_KEY` en env
3. Verificar que el dominio de envío esté verificado en Resend dashboard
4. Verificar que `RESEND_FROM_EMAIL` sea válido

### Para dunning emails:
1. Verificar que el cron `/api/cron/billing-dunning` esté corriendo
2. En Vercel → Functions → buscar `billing-dunning` → ver logs
3. Verificar que `CRON_SECRET` esté configurado

### Test manual:
```bash
# Enviar email de prueba
curl -X POST https://tudominio.com/api/notifications/test-email \
  -H "Authorization: Bearer {STAFF_INVITE_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"email": "tu@email.com"}'
```

**Archivos relevantes:**
- `src/lib/email/resend.ts`
- `src/lib/email/booking-emails.ts`
- `src/lib/email/dunning-emails.ts`
- Variable: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

---

## 4. "El cron de billing no corre"

**Síntomas:** Shops no se desactivan cuando vencen, no se envían dunning emails

### Causa probable: `vercel.json` mal configurado o `CRON_SECRET` faltante

1. Verificar `vercel.json` tiene los 3 crons definidos
2. Verificar que Vercel Pro/Enterprise (los crons requieren plan de pago)
3. Verificar `CRON_SECRET` en env
4. Verificar en Vercel → Functions → Cron Jobs que aparezcan como "Enabled"

### Verificar manualmente:
```bash
# Testear cron de billing-expiry
curl https://tudominio.com/api/cron/billing-expiry \
  -H "Authorization: Bearer {CRON_SECRET}"
# Debe retornar: {"ok":true,"updated":0}
```

### Si los crons no aparecen en Vercel:
1. Verificar que `vercel.json` esté en la raíz del repo
2. Hacer redeploy desde Vercel dashboard
3. Verificar que el branch sea el mismo que deploya

**Archivos relevantes:**
- `vercel.json`
- `src/app/api/cron/billing-expiry/route.ts`
- `src/app/api/cron/billing-dunning/route.ts`
- `src/app/api/cron/bank-transfer-cleanup/route.ts`
- Variable: `CRON_SECRET`

---

## 5. "La PWA no carga o el service worker falla"

**Síntomas:** La app no se instala, offline no funciona, errores en consola del navegador

### Causa probable: Service worker desactualizado o manifest mal configurado

1. Abrir DevTools → Application → Service Workers
2. Si hay un SW registrado pero con errores → "Unregister" y recargar
3. Verificar `public/manifest.json` existe y es válido
4. Verificar que los iconos existan en `public/icons/`

### Para rebuild:
1. El SW se genera automáticamente con `next build`
2. Si cambiaste `next.config.mjs` (workbox config), hacer redeploy
3. Verificar que `@ducanh2912/next-pwa` esté en `package.json`

**Archivos relevantes:**
- `next.config.mjs` (configuración PWA)
- `public/manifest.json`
- `public/icons/`
- `src/components/dashboard/pwa-install-button.tsx`

---

## 6. "Un usuario ve datos de otra peluquería"

**Síntomas:** Usuario A ve turnos/clientes de Usuario B (CRÍTICO DE SEGURIDAD)

### Causa probable: Multi-tenancy roto

1. **PARAR TODO y verificar inmediatamente**
2. Verificar RLS policies en Supabase → Authentication → Policies
3. Verificar que `middleware.ts` inyecta `x-shop-id` correctamente
4. Verificar que `requireShopId()` / `canAccessShopId()` se llama en todas las server actions

### Para verificar:
```sql
-- En Supabase SQL Editor, verificar que RLS está habilitado
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- Todas las tablas deben tener rowsecurity = true
```

### Si RLS está deshabilitado:
1. **URGENTE:** Ejecutar `ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;` para cada tabla
2. Verificar que las policies existen: `SELECT * FROM pg_policies WHERE schemaname = 'public';`

**Archivos relevantes:**
- `middleware.ts`
- `src/lib/dashboard/auth/server.ts` (canAccessShopId, requireShopId)
- `supabase/migrations/000_baseline.sql` (RLS policies)
- Tabla: `shop_memberships`

---

## 7. "Supabase está caído o lento"

**Síntomas:** Timeout en queries, errores 500, app muy lenta

1. Verificar https://status.supabase.com
2. Verificar en Supabase dashboard → Database → Health
3. Verificar conexiones activas: `pg_stat_activity`
4. Si es lento pero no caído → verificar queries lentas en Supabase → Database → Query Performance

### Plan B: Si Supabase se cae frecuentemente
1. La app no tiene fallback offline para server actions
2. Los usuarios verán errores hasta que Supabase vuelva
3. Considerar agregar retry logic en server actions (ya existe `withRetry` en algunos lugares)

**Archivos relevantes:**
- `src/lib/supabase/server.ts`
- `src/lib/dashboard/auth/server.ts`
- Variable: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 8. "Vercel deploy falla"

**Síntomas:** Build error en Vercel, deploy no se completa

### Build commands que deberían funcionar:
```bash
npm run lint        # Debería pasar sin errores
npm run build       # Production build
```

### Errores comunes de build:
1. **TypeScript errors** → `npx tsc --noEmit` localmente
2. **Missing env vars** → Verificar que todas las required estén en Vercel → Settings → Environment Variables
3. **PWA SW not found** → Normal en build, el plugin lo genera después
4. **Out of memory** → Dividir build en partes más pequeñas

### Para forzar rebuild:
1. Vercel → Deployments → ⋯ → "Redeploy"
2. Si falla, probar `npm run build` localmente primero

**Archivos relevantes:**
- `next.config.mjs`
- `package.json`
- `vercel.json`

---

## 9. "El rate limiter bloquea usuarios legítimos"

**Síntomas:** Usuarios ven 429 "too_many_requests" sin razón aparente

### Causa probable: Sin Upstash, el rate limiter es por-instance

1. En Vercel, cada función corre en su propia instancia
2. El in-memory rate limiter NO comparte estado entre instancias
3. Resultado: usuarios pueden ver 429 intermitentes

### Solución:
1. Configurar Upstash Redis:
   - `UPSTASH_REDIS_REST_URL` → desde Upstash dashboard
   - `UPSTASH_REDIS_REST_TOKEN` → desde Upstash dashboard
2. Sin Upstash, el rate limiter sigue funcionando pero con limitaciones

**Archivos relevantes:**
- `src/lib/rate-limiter.ts`
- Variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

---

## 10. "Necesito cambiar el precio de suscripción"

### Opción A: Cambio global (afecta a todos)
1. Editar `src/lib/billing/plans.ts` → cambiar `monthly: 25000`
2. Hacer deploy
3. **CUIDADO:** Los PreApproval existentes siguen con el precio viejo en MP

### Opción B: Cambio dinámico (recomendado)
1. Usar la tabla `site_settings` en Supabase
2. La app ya soporta precio dinámico via `src/lib/admin/site-settings.ts`
3. No requiere deploy

**Archivos relevantes:**
- `src/lib/billing/plans.ts`
- `src/lib/admin/site-settings.ts`
- Tabla: `site_settings`

---

## Contactos de emergencia

| Servicio | Dashboard | Soporte |
|----------|-----------|---------|
| Supabase | https://supabase.com/dashboard | https://supabase.com/docs/guides/platform/support |
| Mercado Pago | https://www.mercadopago.com.ar/developers | https://www.mercadopago.com.ar/ayuda |
| Vercel | https://vercel.com/dashboard | https://vercel.com/help |
| Resend | https://resend.com/dashboard | https://resend.com/docs/introduction |
| Sentry | https://sentry.io | https://docs.sentry.io |
| Upstash | https://upstash.com | https://upstash.com/docs |
