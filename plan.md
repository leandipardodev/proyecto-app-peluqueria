# Plan de correcciones de permisos

Basado en la auditoría, estos son los cambios que recomiendo. Cada punto tiene un nivel de riesgo y esfuerzo.

---

## 🚨 Prioridad 1 — Brechas sin auth

### P1.1 Agregar `requireShopId()` a export-actions.ts
**Archivo:** `src/lib/dashboard/export-actions.ts`
**Qué:** Las 5 funciones export (`fetchExportCustomers`, `fetchExportStock`, `fetchExportAppointments`, `fetchExportFinances`, `fetchExportStaffProduction`) no verifican ni siquiera membresía.
**Cambio:** Agregar `const { shopId: verifiedShopId, error } = await requireShopId(); if (error) return { success: false, error };` al inicio de cada una.
**Esfuerzo:** Bajo

### P1.2 Agregar `requireShopId()` a shop date overrides
**Archivo:** `src/lib/dashboard/business-actions.ts`
**Qué:** `fetchShopDateOverrides`, `upsertShopDateOverride`, `deleteShopDateOverride` no tienen auth check.
**Cambio:** Reemplazar `shopId` parámetro por `requireShopId()`.
**Esfuerzo:** Bajo

### P1.3 Agregar `requireShopId()` a voucher functions sin auth
**Archivo:** `src/lib/dashboard/voucher-actions.ts`
**Qué:** `fetchVoucherWhatsappTemplate`, `updateVoucherWhatsappTemplate`, `markVoucherReminderSent`, `markVoucherRedeemed` no verifican auth.
**Cambio:** Agregar `requireShopId()`.
**Esfuerzo:** Bajo

---

## 🔒 Prioridad 2 — Staff no debería modificar configuración del negocio

### P2.1 Cambiar business-settings a `requireOwnerShopId()`
**Archivos:** `src/lib/dashboard/business-actions.ts`
**Qué:** `updateBusinessInfo`, `updateBusinessHours`, `updateWhatsappTemplateAction`, `updateLoyaltyProgramAction`, `runLoyaltyRaffleAction`, `fetchShopDateOverrides`, `upsertShopDateOverride`, `deleteShopDateOverride`
**Cambio:** Reemplazar `requireShopId()` por `requireOwnerShopId()`. Staff puede **ver** datos via `fetchBusinessData`, pero no modificarlos.
**Esfuerzo:** Medio (8 funciones)

### P2.2 Cambiar booking theme a `requireOwnerShopId()`
**Archivo:** `src/lib/dashboard/booking-theme-actions.ts`
**Qué:** `upsertBookingTheme`, `uploadBookingLogo`
**Cambio:** Usar `requireOwnerShopId()`.
**Esfuerzo:** Bajo

---

## 💰 Prioridad 3 — Staff y finanzas

### P3.1 Decidir: ¿Staff puede gestionar caja y finanzas?
**Opción A (staff operacional):** Staff puede ver finanzas pero NO modificar (solo crear turnos y marcar completados). Cambiar a `requireOwnerShopId()` en: `openCashSession`, `closeCashSession`, `createCashMovement`, `createExpense`, `deleteExpense`, `upsertStaffCompensationRule`, `createStaffPreLiquidation`, `markStaffLiquidationPaid`. Mantener `requireShopId()` para lecturas.
**Opción B (staff actual):** Staff puede todo. Dejar como está.
**Esfuerzo:** Medio (8 funciones a cambiar)

### P3.2 Dashboard: filtrar métricas financieras
**Archivo:** `src/lib/dashboard/dashboard-summary.ts`
**Qué:** `fetchDashboardSummary` y `fetchDashboardMetrics` exponen ingresos totales y ganancias. Si se decide que staff no ve finanzas, limitar datos devueltos según rol.
**Esfuerzo:** Medio

---

## 📦 Prioridad 4 — Staff y modificación de inventario/servicios

### P4.1 Decidir: ¿Staff puede modificar servicios, stock y combos?
Actualmente staff puede crear/modificar/eliminar servicios, productos y combos. Si se quiere restringir:
- `service-actions.ts`: `requireOwnerShopId()` en update/delete
- `inventory-actions.ts`: `requireOwnerShopId()` en addProduct/updateStock/deleteProduct
- `combo-actions.ts`: `requireOwnerShopId()` en create/update/delete
**Esfuerzo:** Medio

---

## 🧾 Prioridad 5 — UI y navegación

### P5.1 Sidebar condicional por rol
**Archivo:** `src/components/dashboard/dashboard-sidebar.tsx`
**Qué:** Si staff no puede acceder a Caja, Mi Negocio, Features, Billing — ocultar esos links.
**Cambio:** Pasar `role` al sidebar y filtrar `navItems`.
**Esfuerzo:** Bajo

### P5.2 Endurecer `isOwnerOrAdmin` — validar server-side
**Qué:** El patrón `disabled={!isOwnerOrAdmin}` en UI no protege server-side. Las server actions deben rechazar a staff explícitamente.
**Cambio:** Ya cubierto en P2.1, P2.2, P3.1.

---

## 📊 Resumen de decisión requerida

| Área | Situación actual | Opción A (restringido) | Opción B (permitido) |
|------|-----------------|----------------------|---------------------|
| Finanzas/Caja | Staff ve y modifica todo | Staff solo ve, solo owner modifica | Staff puede todo |
| Mi Negocio | Staff modifica casi todo | Staff solo ve | Staff puede todo |
| Booking theme | Staff modifica | Staff solo ve | Staff puede todo |
| Servicios | Staff modifica | Staff solo ve | Staff puede todo |
| Stock | Staff modifica | Staff solo ve | Staff puede todo |
| Combos | Staff modifica | Staff solo ve | Staff puede todo |
| Export datos | Sin auth | `requireShopId()` mínimo | Idem |
