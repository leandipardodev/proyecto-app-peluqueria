# Product events (Prioridad 3)

Este documento deja trazado el tracking base para metricas de activacion, retencion y conversion.

## Eventos implementados

- `trial_started`: alta de local con trial en signup owner (email/password y OAuth) y primer local creado por usuario owner.
- `first_staff_added`: primer alta de personal con rol `staff`.
- `first_service_published`: primer servicio creado en el local.
- `first_booking_confirmed`: primer turno que pasa a estado `confirmed`.
- `subscription_paid`: pago de suscripcion aprobado por webhook de Mercado Pago.
- `subscription_canceled`: baja automatica por expiracion de gracia en cron de billing.

## Esquema

- `product_events`: eventos historicos (`shop_id`, `event_type`, `metadata`, `occurred_at`).
- `product_event_markers`: llaves unicas por local para garantizar eventos "first_*" idempotentes.

Migracion: `supabase/migrations/039_add_product_events.sql`.

## Validacion rapida

- Ejecutar `npm run audit:product-events` para verificar que la instrumentacion minima exista en los flujos esperados.

## Siguiente paso recomendado

- Construir consulta/endpoint de metricas (D7, D30, churn y funnel onboarding) consumiendo `product_events`.
