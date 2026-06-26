# Auditoría de Permisos: Staff vs Owner

## Roles existentes
- `owner` — dueño del local
- `admin` — sin uso real, tratado igual que `staff` en todos lados
- `staff` — empleado
- `customer` — cliente final

## Resumen corto
**Staff puede ver TODO y modificar CASI TODO.** Solo 5 operaciones están realmente protegidas server-side como owner-only. El resto usa `requireShopId()` que simplemente verifica que el usuario sea miembro activo del local, sin importar su rol.

---

## 1. Staff SÍ puede ver (server-side, sin filtrado)

- **Dashboard principal** — ingresos totales, ganancias netas, turnos próximos, productos con bajo stock
- **Calendario** — todos los turnos del local, de todos los profesionales
- **Clientes** — lista completa con teléfonos, emails, loyalty rewards
- **Servicios** — lista de precios, duración, etc.
- **Inventario/Stock** — todos los productos y cantidades
- **Combos/Paquetes** — todos los combos y precios
- **Finanzas completas** — sesión de caja, movimientos, gastos, liquidaciones de staff, producción por profesional, reglas de compensación
- **Staff/Miembros** — lista de todos los empleados con sus roles y modelos de pago
- **Exportación de datos** — clientes, stock, turnos, finanzas, producción (sin ninguna verificación de rol)
- **Vouchers** — todos los cupones y templates
- **Fidelización** — programas de lealtad, datos de canje
- **Mi Negocio** — nombre, descripción, dirección, teléfono, redes, horarios, WhatsApp template, policy de seña, date overrides
- **Booking theme** — template, secciones, texto, logo
- **Fichas de cliente** — historial de visitas, gasto total

## 2. Staff SÍ puede modificar (server-side permitido)

- Turnos (crear, editar, cancelar, borrar, cambiar profesional, cambiar servicios, cambiar estado a completado, canjear loyalty)
- Clientes (crear, modificar nombre/teléfono/email)
- Servicios (crear, modificar nombre/precio/duración, eliminar)
- Inventario (agregar productos, ajustar stock, eliminar)
- Combos (crear, modificar, eliminar, activar/desactivar)
- **Finanzas/Caja:**
  - Abrir y cerrar sesión de caja
  - Registrar movimientos de caja
  - Crear y eliminar gastos
  - Crear/preliquidar liquidaciones de staff
  - Marcar liquidaciones como pagadas
  - Modificar reglas de compensación de staff
- Mi Negocio (nombre, descripción, dirección, teléfono, Instagram, horarios, WhatsApp template)
- Fidelización (activar/desactivar programa, cambiar descuento, cambiar cortes requeridos, **ejecutar sorteos**)
- Date overrides (crear, eliminar — sin NINGUNA verificación de auth)
- Booking theme (template, hero title/subtitle, about, logo)
- Vouchers (crear, marcar como canjeados, modificar template de WhatsApp)

## 3. Lo que SÍ está bloqueado para staff (owner-only)

| Operación | Dónde | Cómo |
|-----------|-------|------|
| Clave Mercado Pago (pública + access token) | `mercadopago-actions.ts` | `requireOwnerShopId()` |
| OAuth de Mercado Pago (conectar/desconectar) | `business-actions.ts` | `requireOwnerShopId()` |
| Policy de seña | `business-actions.ts` | `requireOwnerShopId()` |
| Eliminar el local | `shop-actions.ts` | `requireOwnerShopId()` |
| Gestionar staff (invitar, cambiar rol, eliminar) | `staff-actions.ts` | `requireOwnerAccessForShop()` |
| Billing/checkout | `/api/billing/checkout` | `membership.role === "owner"` |
| Página de Features | `features/page.tsx` | Redirect si role === "staff" |
| Página de Billing | `billing/page.tsx` | `.in("role", ["owner", "admin"])` |

## 4. Brechas de seguridad críticas

1. **`export-actions.ts` — SIN NINGUNA auth check.** Cualquier usuario autenticado que pueda importar y llamar estas server functions obtiene TODOS los datos del local (clientes, finanzas, turnos, stock, producción). Ni siquiera requiere ser miembro del local.

2. **`date overrides` (`upsertShopDateOverride`, `deleteShopDateOverride`) — SIN NINGUNA auth check.** Toman `shopId` como parámetro sin verificar membresía ni rol.

3. **`voucher-actions.ts`** — 5 de 7 funciones sin auth check o solo `canAccessShopId`.

4. **`autoCompletePastAppointments`** — usa `createAdminClient()` sin ningún check de usuario. Si alguien llama esto desde el cliente, se ejecuta.

5. **Clientes (`customers-client.tsx`)** — página puramente client-side que consulta Supabase directo sin verificar rol. Un staff podría modificar cualquier cliente.

## 5. Brechas de UI (side effects)

1. **Sidebar** — staff ve enlaces a Caja, Mi Negocio, Stock aunque algunas acciones estén deshabilitadas en UI. La sola visibilidad puede generar confusión.

2. **`isOwnerOrAdmin` en business-client** — deshabilita inputs pero no impide que staff ejecute las server actions. Un request HTTP directo bypassearía la UI.

3. **Staff ve ingresos totales, ganancias netas, y métricas financieras** en el dashboard y en la página de finanzas.

## 6. Resumen de server actions sin auth o con auth insuficiente

| Archivo | Funciones | Auth actual | Debería ser |
|---------|-----------|-------------|-------------|
| `export-actions.ts` | 5 funciones export | **NONE** | `requireShopId()` mínimo |
| `business-actions.ts` | `fetchShopDateOverrides`, `upsertShopDateOverride`, `deleteShopDateOverride` | **NONE** | `requireShopId()` mínimo |
| `voucher-actions.ts` | `fetchVoucherWhatsappTemplate`, `updateVoucherWhatsappTemplate`, `markVoucherReminderSent`, `markVoucherRedeemed` | **NONE** | `requireShopId()` mínimo |
| `finances-actions.ts` | 16 funciones | `requireShopId()` | ¿`requireOwnerShopId()`? |
| `booking-theme-actions.ts` | `upsertBookingTheme`, `uploadBookingLogo` | `requireShopId()` | ¿`requireOwnerShopId()`? |
| `business-actions.ts` | `updateBusinessInfo`, `updateBusinessHours`, `updateWhatsappTemplateAction`, `updateLoyaltyProgramAction`, `runLoyaltyRaffleAction` | `requireShopId()` | ¿`requireOwnerShopId()`? |
| `appointment-mutations.ts` | 11 funciones | `canAccessShopId()` | OK para staff (operacional) |
| `inventory-actions.ts` | 5 funciones | `requireShopId()` | ¿`requireOwnerShopId()`? |
| `service-actions.ts` | CRUD servicios | `requireShopId()` | ¿`requireOwnerShopId()`? |
| `combo-actions.ts` | CRUD combos | `requireShopId()` | ¿`requireOwnerShopId()`? |
| `customers-actions.ts` | fetch customers | `requireShopId()` | OK para staff (operacional) |
