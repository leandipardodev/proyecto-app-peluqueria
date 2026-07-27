# Flujos de Pago — Klip

> **Archivo principal:** `src/app/api/payments/mercadopago-webhook/route.ts` (647 líneas)
> Este es el archivo más crítico del sistema. Si algo se rompe acá, dejás de cobrar.

---

## Resumen general

Klip tiene 3 flujos de pago, todos procesados por el mismo webhook POST handler:

```
POST /api/payments/mercadopago-webhook?type=X&data.id=Y&shop_id=Z&scope=billing
```

### Flujo 1: Suscripción automática (PreApproval)
### Flujo 2: Pago manual de suscripción (Preference)
### Flujo 3: Pago de turno con depósito (pending_booking)

---

## Flujo 1: Suscripción automática (PreApproval)

```
┌─────────────────────────────────────────────────────────────┐
│  OWNER activa suscripción automática                         │
│  POST /api/billing/subscription/activate                     │
│  → Crea PreApproval en MP con auto_recurring=true           │
│  → external_reference = "shop_sub_auto:{shopId}"            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK: subscription_preapproval                          │
│  action = "preapproval.approved" o "preapproval.created"    │
│                                                              │
│  1. Busca preapproval por resource_id en MP API             │
│  2. Parsea external_reference → extrae shopId               │
│  3. UPSERT shop_subscriptions (onConflict: preapproval_id)  │
│  4. Calcula plan_expiry:                                     │
│     - Si tiene días pagos restantes → suma 1 mes desde ahí  │
│     - Si no → suma 1 mes desde hoy                          │
│  5. UPDATE shops (active=true, plan_expiry=nuevo)           │
│  6. INSERT shop_billing_events (subscription_auto_activated)│
└─────────────────────────────────────────────────────────────┘

                      │
                      ▼ (cada mes, MP cobra automáticamente)

┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK: subscription_charged                              │
│  1. Busca subscription por preapproval_id                   │
│  2. Si status=authorized:                                   │
│     - Misma lógica de plan_expiry que arriba                 │
│     - UPDATE shops (active=true, plan_expiry+=1 mes)       │
│     - INSERT shop_billing_events (subscription_auto_charge) │
└─────────────────────────────────────────────────────────────┘

                      │ (si el owner cancela)

┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK: subscription_preapproval                          │
│  action = "preapproval.cancelled"                           │
│  → UPDATE shop_subscriptions SET status="cancelled"         │
│  → NO desactiva el shop (sigue activo hasta que expire)     │
└─────────────────────────────────────────────────────────────┘
```

### Tablas involucradas:
- `shop_subscriptions` — Estado de la suscripción automática
- `shops` — `active`, `plan_expiry`
- `shop_billing_events` — Audit trail

### external_reference format:
```
shop_sub_auto:{shopId}
```

---

## Flujo 2: Pago manual de suscripción

```
┌─────────────────────────────────────────────────────────────┐
│  OWNER hace checkout manual                                 │
│  POST /api/billing/checkout                                 │
│  → Crea Preference en MP                                    │
│  → external_reference = "shop_sub:{shopId}:monthly:{ts}"   │
│  → webhook notification URL con ?shop_id=X&scope=billing   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK: type="payment" + scope="billing"                 │
│                                                              │
│  1. Parsea external_reference → shopId + cycle             │
│  2. INSERT shop_billing_events (subscription_payment_webhook)│
│  3. Si status != "approved" → retorna ok (no procesa)      │
│  4. INSERT shop_billing_events (subscription_payment_applied)│
│     → Si es unique violation (23505) → ya procesado, retorna│
│  5. Calcula plan_expiry (misma lógica)                      │
│  6. UPDATE shops (active=true, plan_expiry+=cycle_months)   │
│  7. trackProductEvent(subscription_paid)                     │
└─────────────────────────────────────────────────────────────┘
```

### external_reference format:
```
shop_sub:{shopId}:monthly:{timestamp}
```

### Tablas involucradas:
- `shop_billing_events` — Idempotencia via unique constraint
- `shops` — `active`, `plan_expiry`

---

## Flujo 3: Pago de turno con depósito

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTE reserva turno con depósito                         │
│  → pending_booking_actions.ts crea Preference en MP         │
│  → Crea pending_booking en DB (status="pending")           │
│  → external_reference = "pending_booking:{bookingId}"      │
│  → Si no paga en X tiempo → pending_booking expira         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK: type="payment" + pending_booking: prefix          │
│                                                              │
│  1. Extrae bookingId del external_reference                 │
│  2. Busca pending_booking en DB                             │
│  3. Si status != "pending" o expiró → retorna ok           │
│  4. Si status="approved":                                   │
│     a. ATÓMICAMENTE claim: UPDATE status="completed"        │
│        WHERE status="pending" (solo uno gana)              │
│     b. INSERT shop_billing_events (audit trail)            │
│     c. CREATE o UPDATE customer                             │
│     d. RE-CHECK slot availability (puede haber conflicto)  │
│     e. Si conflicto → marca expired, retorna ok            │
│     f. INSERT appointment (status="confirmed", is_paid=true)│
│     g. SEND confirmation email (fire & forget)             │
│  5. Si status != "approved":                                │
│     → UPDATE pending_booking SET status="cancelled"|"expired"│
└─────────────────────────────────────────────────────────────┘
```

### external_reference format:
```
pending_booking:{bookingId}
```

### Tablas involucradas:
- `pending_bookings` — Estado de la reserva
- `customers` — Crear o actualizar cliente
- `appointments` — Crear turno confirmado
- `shop_billing_events` — Audit trail
- `mercadopago_logs` — Log del evento MP

---

## Flujo 4: Pago regular de turno (sin depósito)

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTE paga turno existente (checkout normal)             │
│  POST /api/checkout                                         │
│  → Crea Preference en MP                                    │
│  → metadata.appointment_id = appointmentId                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK: type="payment" (sin prefijo especial)            │
│                                                              │
│  1. Extrae appointment_id de metadata o external_reference  │
│  2. Resuelve status: approved→confirmed, pending→pending,  │
│     otros→cancelled                                         │
│  3. Busca appointment en DB                                 │
│  4. Determina IDs a actualizar (main + combos)             │
│  5. UPDATE appointments (status, is_paid, mp_preference_id) │
│  6. Si approved:                                            │
│     - INSERT shop_billing_events (appointment_payment_applied)│
│     - Si unique violation → ya registrado, safe             │
│  7. INSERT mercadopago_logs (audit)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Verificación de firma HMAC

```typescript
// En route.ts, línea 51-80
x-signature header format: "ts={timestamp} v1={hmac_hex}"
signing_string: "{rawBody}|{ts}"
algorithm: HMAC-SHA256
secret: MP_WEBHOOK_SECRET
comparison: crypto.timingSafeEqual()
```

**Si la firma no coincide → retorna 401 y NO procesa el pago.**

---

## Rate Limiting

- **Límite:** 30 requests por 60 segundos por IP
- **Implementación:** `createRateLimiter` en `src/lib/rate-limiter.ts`
- **Sin Upstash:** fallback a in-memory LRU (no funciona en Vercel multi-instance)
- **Con Upstash:** distributed rate limiting

---

## Cálculo de plan_expiry (duplicado 3 veces)

La lógica está en 3 lugares con slight differences:

| Ubicación | Líneas | Contexto |
|-----------|--------|----------|
| subscription_preapproval handler | 181-197 | Suscripción automática |
| subscription_charged handler | 231-248 | Cobro automático |
| payment/billing handler | 326-343 | Pago manual |

**Lógica común:**
```
si tiene días pagos restantes:
  base = plan_expiry actual
sino:
  base = hoy
plan_expiry = base + 1 mes
```

---

## Cron Jobs relacionados con billing

| Cron | Horario (UTC) | Qué hace |
|------|---------------|----------|
| `/api/cron/billing-expiry` | 6:10 diario | Desactiva shops con plan_expiry + 2 días de gracia |
| `/api/cron/billing-dunning` | 6:30 diario | Envía emails de dunning (7d, 3d, 1d, expired, grace last day) |
| `/api/cron/bank-transfer-cleanup` | 12:00 diario | Borra pending_bookings expirados de transferencia |

**Autenticación de crons:** `Bearer {CRON_SECRET}` con `crypto.timingSafeEqual`

---

## Errores comunes y debugging

### "Webhook processing failed" (500)
1. Revisar Sentry para el stack trace completo
2. Verificar que `MP_WEBHOOK_SECRET` coincida con el configurado en MP dashboard
3. Verificar que `MP_ACCESS_TOKEN` sea válido
4. Verificar que la tabla `shop_billing_events` exista

### Pagos no se procesan
1. Verificar que el webhook URL en MP dashboard apunte a `/api/payments/mercadopago-webhook`
2. Verificar que `type=payment` o `type=subscription_preapproval` llega como query param
3. Verificar que `shop_id` y `scope` están en la URL del webhook

### Doble cobro
1. La idempotencia se maneja via unique constraint en `shop_billing_events`
2. Si ves duplicados, verificar que la constraint unique existe en la tabla
3. El flujo pending_booking usa atomic claim (UPDATE WHERE status="pending")

### Suscripción automática no renueva
1. Verificar `shop_subscriptions.status = "authorized"`
2. Verificar que MP sigue cobrando (dashboard de MP → PreApprovals)
3. Verificar que el webhook llega con `type=subscription_charged`

---

## Archivos clave para referencia

| Archivo | Propósito |
|---------|-----------|
| `src/app/api/payments/mercadopago-webhook/route.ts` | Webhook handler principal |
| `src/app/api/billing/checkout/route.ts` | Checkout manual |
| `src/app/api/billing/subscription/activate/route.ts` | Activar suscripción automática |
| `src/app/api/billing/subscription/cancel/route.ts` | Cancelar suscripción |
| `src/lib/billing/plans.ts` | Precios (25,000 ARS/mes) |
| `src/lib/payments/mercadopago-actions.ts` | Crear preferencias MP |
| `src/lib/admin/site-settings.ts` | Precio dinámico desde DB |
| `src/app/api/cron/billing-expiry/route.ts` | Cron de expiración |
| `src/app/api/cron/billing-dunning/route.ts` | Cron de dunning emails |
