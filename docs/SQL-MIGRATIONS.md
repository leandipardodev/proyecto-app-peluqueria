# Guía de Migraciones SQL — Klip

> 30 archivos de migración, desde el baseline hasta bank transfers.
> **NUNCA editar `database.types.ts` a mano** — siempre regenerar con `npm run supabase:gen-types`

---

## Cómo funcionan las migraciones

1. Cada archivo en `supabase/migrations/` se ejecuta en orden alfabético
2. Supabase aplica las migraciones pendientes al hacer `supabase db push`
3. Después de cada migración, regenerar tipos: `npm run supabase:gen-types`

### Para aplicar migraciones:
```bash
# Conectar a tu proyecto
supabase link --project-ref {tu-project-ref}

# Aplicar migraciones pendientes
supabase db push

# Regenerar types
npm run supabase:gen-types
```

### Para crear una nueva migración:
```bash
supabase migration new {nombre_descriptivo}
# Esto crea un archivo en supabase/migrations/ con timestamp
# Editar el archivo SQL, luego:
supabase db push
```

---

## Archivos de migración

### Baseline (la base completa)

| Archivo | Líneas | Contenido |
|---------|--------|-----------|
| `000_baseline.sql` | ~1,365 | Todas las tablas iniciales, RLS policies, functions, indexes |

**Tablas principales en el baseline:**
- `shops` — Peluquerías/barberías (multi-tenant root)
- `user_profiles` — Perfiles de usuario
- `shop_memberships` — Relación usuario-peluquería con rol
- `appointments` — Turnos
- `customers` — Clientes por peluquería
- `services` — Servicios ofrecidos
- `staff` — Empleados
- `staff_schedules` — Horarios de empleados
- `staff_services` — Qué servicios puede hacer cada empleado
- `inventory` — Stock de productos
- `vouchers` — Vouchers de cumpleaños/fidelización
- `site_settings` — Configuración del sitio
- `admin_allowlist` — Acceso de super admin
- `admin_audit_logs` — Log de acciones de admin

### Migraciones incrementales (044-077)

| Archivo | Qué agrega |
|---------|-----------|
| `044_add_pending_booking_exclusion.sql` | Constraint de exclusión para pending_bookings |
| `050_fix_pending_bookings_rls.sql` | Fix RLS policies para pending_bookings |
| `051_fix_shops_rls_multi_shop.sql` | Fix RLS para shops con múltiples usuarios |
| `052_add_composite_indexes.sql` | Índices compuestos para queries frecuentes |
| `053_add_service_price_happened_at.sql` | Campo `happened_at` en services |
| `054_add_pay_at_shop.sql` | Campo `pay_at_shop` en appointments |
| `055_add_performance_indexes.sql` | Más índices + trigger `set_updated_at` |
| `056_add_invite_accepted_at.sql` | Campo `invite_accepted_at` en memberships |
| `057_create_combos.sql` | Tabla `combos` para servicios combo |
| `058_add_combo_duration.sql` | Campo `duration_minutes` en combos |
| `059_add_missing_indexes.sql` | Índices faltantes |
| `060_staff_services_and_schedules.sql` | Tablas `staff_services`, `staff_schedules` |
| `061_staff_profiles.sql` | Campos de perfil en staff |
| `062_add_service_description.sql` | Campo `description` en services |
| `063_add_recurring_group_id.sql` | Campo `recurring_group_id` para turnos recurrentes |
| `064_staff_overrides_enabled.sql` | Campo `overrides_enabled` en staff |
| `065_fix_appointments_constraints.sql` | Fix constraints en appointments |
| `066_create_shop_date_overrides.sql` | Tabla `shop_date_overrides` (feriados, horarios especiales) |
| `067_fix_shops_delete_rls.sql` | Fix RLS para DELETE en shops |
| `068_atomic_loyalty_redeem.sql` | Función PL/pgSQL para canje atómico de puntos de fidelización |
| `069_exclusion_constraint_double_booking.sql` | **CRÍTICO** — Constraint de exclusion para prevenir doble booking |
| `070_drop_booking_theme_template_id_check.sql` | Drop check constraint obsoleto |
| `071_add_customer_tags.sql` | Campo `tags` en customers |
| `072_add_break_to_date_overrides.sql` | Campo `break` en shop_date_overrides |
| `073_add_custom_service_fields.sql` | Campos personalizados de servicio |
| `074_create_shop_subscriptions.sql` | Tabla `shop_subscriptions` para billing recurrente |
| `075_realtime_publication.sql` | Agrega tablas a `supabase_realtime` publication |
| `076_add_site_settings.sql` | Tabla `site_settings` para configuración dinámica |
| `077_add_bank_transfer.sql` | Tabla + campos para pagos por transferencia bancaria |

---

## Tablas críticas para el negocio

### `shops` — Multi-tenancy root
```sql
-- Campos clave
id UUID PRIMARY KEY
nombre TEXT
slug TEXT UNIQUE
active BOOLEAN DEFAULT true
plan_expiry TIMESTAMPTZ
mp_access_token TEXT  -- Token de MP del shop (cada shop tiene el suyo)
mp_public_key TEXT
```

### `shop_memberships` — Quién puede acceder a qué
```sql
-- Campos clave
user_id UUID → auth.users(id)
shop_id UUID → shops(id)
role TEXT  -- 'owner' | 'admin' | 'staff' | 'customer'
is_active BOOLEAN DEFAULT true
-- UNIQUE(user_id, shop_id)
```

### `appointments` — Turnos (la tabla más importante)
```sql
-- Campos clave
shop_id UUID → shops(id)
customer_id UUID → customers(id)
staff_id UUID → staff(id)
service_id UUID → services(id)
start_time TIMESTAMPTZ
end_time TIMESTAMPTZ
status TEXT  -- 'confirmed' | 'cancelled' | 'completed' | 'no_show'
is_paid BOOLEAN DEFAULT false
deposit_amount NUMERIC
-- Constraint de exclusion (migración 069):
-- Previene dos turnos en el mismo horario para el mismo staff
```

### `pending_bookings` — Reservas con depósito
```sql
-- Campos clave
shop_id UUID → shops(id)
customer_name TEXT
customer_phone TEXT
customer_email TEXT
service_id UUID
start_time TIMESTAMPTZ
end_time TIMESTAMPTZ
staff_id UUID
status TEXT  -- 'pending' | 'completed' | 'expired' | 'cancelled'
expires_at TIMESTAMPTZ
mp_preference_id TEXT
deposit_amount NUMERIC
```

### `shop_billing_events` — Audit trail de pagos
```sql
-- event_types que usa la app:
-- 'subscription_auto_activated'
-- 'subscription_auto_charge_applied'
-- 'subscription_payment_webhook'
-- 'subscription_payment_applied'
-- 'appointment_payment_applied'
-- 'subscription_marked_inactive_by_cron'
-- 'dunning_7_days' | 'dunning_3_days' | 'dunning_1_day'
-- 'dunning_expired' | 'dunning_grace_last_day'
```

---

## RLS (Row Level Security)

**Todas las tablas tienen RLS habilitado.** Las policies más importantes:

### Shops
- Users solo ven shops donde tienen `shop_memberships` activo
- Owners pueden editar su shop
- Service role bypasses RLS (para admin operations)

### Appointments
- Users solo ven appointments de su shop
- Staff solo ve sus propios appointments (o todos si es owner/admin)

### Customers
- Users solo ven customers de su shop
- Customer role solo ve sus propios datos

### Staff
- Users solo ven staff de su shop
- Staff solo ve su propio perfil (a menos que sea owner/admin)

---

## Constraints importantes

### Exclusion constraint (migración 069)
```sql
-- Previene doble booking para el mismo staff
-- Usa COALESCE con UUID sentinela para staff_id NULL
EXCLUDE USING gist (
  shop_id WITH =,
  staff_id WITH =,
  tstzrange(start_time, end_time) WITH &&
)
```
**Si esta constraint falla, se pueden crear turnos superpuestos.**

### Atomic loyalty redeem (migración 068)
```sql
-- Función PL/pgSQL que canjea puntos de forma atómica
-- Usa FOR UPDATE para prevenir race conditions
```

---

## Realtime (migración 075)

Cuatro tablas están en `supabase_realtime` publication:
- `appointments` — Calendario se actualiza en tiempo real
- `customers` — Lista de clientes se actualiza
- `services` — Lista de servicios se actualiza
- `shop_memberships` — Detección de cambios de rol

---

## Comandos útiles

```bash
# Regenerar types después de cualquier migración
npm run supabase:gen-types

# Ver migraciones pendientes
supabase db diff

# Reset local database (CUIDADO: borra todo)
supabase db reset

# Crear nueva migración
supabase migration new nombre_descriptivo

# Push migraciones a producción
supabase db push
```

---

## Errores comunes de migración

### "relation already exists"
- La tabla ya fue creada en una migración anterior
- Verificar el baseline `000_baseline.sql`

### "constraint already exists"
- La constraint ya fue creada
- Buscar en migraciones anteriores

### "column already exists"
- La columna ya existe
- Buscar en migraciones anteriores

### "permission denied for table"
- RLS está bloqueando la operación
- Usar service role client en lugar de anon client

### Tipos de TypeScript no coinciden con la DB
- Ejecutar `npm run supabase:gen-types`
- Verificar que `src/lib/supabase/database.types.ts` se actualizó
