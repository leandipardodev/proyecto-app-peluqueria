# Stats Debug Master Plan (Klip)

Este plan sirve para auditar y corregir absolutamente todas las metricas visibles en Klip.

## 0) Objetivo

Garantizar que cada numero mostrado en dashboard, finanzas, turnos, staff y admin:

- use una formula consistente,
- lea la fuente correcta,
- respete timezone AR,
- y coincida con DB para el mismo rango de fechas.

## 1) Inventario de metricas y fuentes

### 1.1 Dashboard (owner/shop)

- Archivo principal: `src/lib/dashboard/dashboard-summary.ts`
- Pantalla: `src/app/dashboard/page.tsx`

Metricas a validar:

- Turnos de hoy (`appointmentsCount`)
- Ingresos del dia (`revenue`)
- Serie mensual ingresos/egresos (`revenueChart`)
- Flujo hoy/semana/mes (`flowByPeriod`)
- Clientes totales (`stats.totalClients`)
- Crecimiento (`stats.growth` y `monthlyGrowth`)
- Turnos totales (`stats.totalAppointments`)

### 1.2 Turnos

- Archivos: `src/app/dashboard/appointments/appointments-table.tsx`, `src/lib/dashboard/appointment-actions.ts`

Metricas a validar:

- Conteo de turnos por estado
- Ingresos por turnos pagos/no pagos
- Senas aplicadas

### 1.3 Finanzas / caja

- Archivo: `src/lib/dashboard/finances-actions.ts`
- Pantalla: `src/app/dashboard/finances/*`

Metricas a validar:

- Ingresos manuales
- Egresos
- Neto
- Cierres/liquidaciones

### 1.4 Staff y pagos a empleados

- Archivo: `src/lib/dashboard/staff-actions.ts`
- Relacion con caja/finanzas

Metricas a validar:

- Comisiones calculadas
- Liquidaciones pendientes/pagadas
- Pagos por periodo

### 1.5 Admin global

- Archivo: `src/lib/admin/analytics.ts`
- Pantalla: `src/app/admin/page.tsx`

Metricas a validar:

- Shops activas/inactivas
- Pagos 30d
- Revenue 30d / all-time
- ARPU
- Tendencias 7/30/90
- Top shops

## 2) Reglas globales de calculo

### 2.1 Timezone

- Todo corte diario/mensual debe usar Argentina.
- Verificar uso consistente de fecha local vs `created_at` UTC.

### 2.2 Estados de turnos

- Definir explicitamente que estados cuentan para cada metrica.
- Evitar mezclar `scheduled` con `completed` segun el indicador.

### 2.3 Rango temporal

- Confirmar inclusividad/exclusividad (`>= inicio`, `< fin`).
- Unificar ventanas (`7/30/90`, mes actual, mes anterior).

### 2.4 Redondeo

- Redondear solo al final del calculo.
- Mantener precision intermedia para evitar drift.

## 3) Protocolo de debug por metrica

Para cada metrica:

1. Registrar formula esperada.
2. Ejecutar query base directa en DB.
3. Ejecutar funcion server action que alimenta UI.
4. Capturar valor en UI.
5. Comparar DB vs action vs UI.
6. Si difiere, clasificar causa:
   - filtro incorrecto,
   - timezone,
   - join/doble conteo,
   - estado no contemplado,
   - fallback/null handling,
   - render/stale cache.

## 4) Dataset QA minimo (obligatorio)

Crear un shop QA con:

- 12 turnos (mezcla de `scheduled`, `confirmed`, `completed`, `cancelled`)
- 6 pagos de turnos
- 4 movimientos de caja ingreso
- 5 movimientos de caja egreso
- 3 registros de liquidacion staff
- 8 clientes (3 nuevos este mes, 2 el mes anterior)

Sin dataset controlado, no se puede cerrar exactitud con confianza.

## 5) Matriz de auditoria (template)

Completar una fila por metrica:

- `metrica`
- `archivo-fuente`
- `formula`
- `query-db`
- `valor-db`
- `valor-action`
- `valor-ui`
- `diff`
- `estado` (OK / INVESTIGAR / FIXED)

## 6) Priorizacion de ejecucion

Orden recomendado:

1. Ganancias y caja
2. Pagos a empleados / liquidaciones
3. Crecimiento
4. Turnos
5. Admin global

## 7) Criterio de cierre

Se considera cerrado cuando:

- todas las metricas criticas quedan en estado `OK`,
- hay evidencia de comparacion DB/action/UI,
- y existe test automatizado para calculos sensibles.

## 8) Siguiente paso inmediato

Primera sesion tecnica: auditar "Ganancias y caja" de punta a punta y documentar resultados en esta misma guia.

---

## Sesion 1: Ganancias y caja (audit trail inicial)

Alcance revisado en codigo:

- `src/lib/dashboard/dashboard-summary.ts`
- `src/lib/dashboard/finances-actions.ts`

### Hallazgos iniciales (estatico, sin ejecutar DB)

1) `DashboardSummary.revenue` suma precios de turnos billables del dia

- Formula actual: suma `services.price` de turnos en `APPOINTMENT_STATUS_BILLABLE`.
- Riesgo: no discrimina `is_paid` en ese resumen puntual.
- Estado: `INVESTIGAR` (confirmar si negocio quiere "facturado" o "cobrado").

2) `flowByPeriod.income` mezcla turnos + ingresos manuales

- Formula actual en `fetchFlowRange`: `appointmentsIncome + extraIncome`.
- Riesgo: posible doble conteo si un cobro de turno tambien se registra como movimiento `finances.type=income`.
- Estado: `INVESTIGAR` (definir politica de origen unico para ingresos).

3) `revenueChart` usa dos calendarios de mes distintos

- Turnos por mes: `date_key_ar.slice(0,7)` (AR).
- Finanzas por mes: `created_at.slice(0,7)` (UTC crudo).
- Riesgo: desfasajes en cierres de mes (especialmente 21:00-23:59 AR).
- Estado: `ALTO` (probable inconsistencia real).

4) Produccion staff incluye `scheduled` y `confirmed` en `generatedRevenue`

- En `fetchStaffProduction` se incluyen estados `completed/confirmed/scheduled`.
- Riesgo: metricas de staff "generadas" pueden inflarse vs caja cobrada.
- Estado: `INVESTIGAR` (si es KPI de pipeline puede ser valido; si es caja no).

5) Pre-liquidacion staff usa solo `completed + is_paid`

- Coherente para pago real a empleado.
- Estado: `OK` (modelo conservador correcto para liquidar).

### Matriz inicial (Ganancias y caja)

| metrica | archivo-fuente | formula actual | riesgo | estado |
|---|---|---|---|---|
| Ingresos del dia (dashboard) | `dashboard-summary.ts` | sum(price turnos billables del dia) | puede no representar "cobrado" | INVESTIGAR |
| Flujo periodo - income | `dashboard-summary.ts` | turnos billables + ingresos manuales | doble conteo potencial | INVESTIGAR |
| Flujo periodo - expenses | `dashboard-summary.ts` | egresos manuales | bajo | OK (pendiente DB) |
| Revenue chart mensual | `dashboard-summary.ts` | turnos(AR) + finanzas(UTC) | desfase mensual | ALTO |
| Produccion staff generada | `finances-actions.ts` | estados scheduled/confirmed/completed | puede inflar comparado con caja | INVESTIGAR |
| Liquidacion staff | `finances-actions.ts` | completed + paid | consistente | OK |

### Queries de verificacion recomendadas (Supabase SQL Editor)

Reemplazar `:shop_id`, `:from`, `:to`.

#### Q1. Ingreso por turnos billables (rango)

```sql
select
  coalesce(sum(s.price),0) as appointments_income
from appointments a
left join services s on s.id = a.service_id
where a.shop_id = :shop_id
  and a.start_time >= :from
  and a.start_time <= :to
  and a.status in ('scheduled','confirmed','completed');
```

#### Q2. Ingreso manual y egreso manual (mismo rango)

```sql
select
  coalesce(sum(case when type='income' then amount end),0) as extra_income,
  coalesce(sum(case when type='expense' then amount end),0) as expenses
from finances
where shop_id = :shop_id
  and created_at >= :from
  and created_at <= :to;
```

#### Q3. Reconciliacion ingreso total mostrado

```sql
-- esperado por formula actual de app:
-- income = appointments_income + extra_income
```

#### Q4. Deteccion de posible doble conteo

```sql
select
  f.id,
  f.amount,
  f.description,
  f.created_at
from finances f
where f.shop_id = :shop_id
  and f.type = 'income'
  and (
    lower(coalesce(f.description,'')) like '%turno%'
    or lower(coalesce(f.description,'')) like '%seña%'
    or lower(coalesce(f.description,'')) like '%sena%'
  )
order by f.created_at desc;
```

### Fixes propuestos (prioridad)

1. Unificar mes AR en `revenueChart` para finanzas (no usar `slice(0,7)` UTC crudo).
2. Definir oficialmente semantica de "ingresos":
   - opcion A: facturado (turnos)
   - opcion B: cobrado (pagos reales)
   - opcion C: mixto (actual), pero documentado.
3. Crear bandera de reconciliacion en UI admin para detectar drift entre turnos y finanzas.

### Proxima sesion (ejecucion)

- Correr Q1-Q4 en shop QA.
- Comparar contra valores en dashboard/finanzas para mismo rango.
- Marcar cada fila de matriz como `OK` o `FIXED` con evidencia numerica.

### Script auxiliar implementado

Se agrego script para auditoria rapida automatizada:

- `scripts/audit-gains-cash.mjs`
- comando: `npm run audit:gains-cash`

Variables necesarias:

- `AUDIT_FROM=YYYY-MM-DD`
- `AUDIT_TO=YYYY-MM-DD`
- opcional `AUDIT_SHOP_ID`

Si `AUDIT_SHOP_ID` no se define, el script toma el ultimo local creado.
