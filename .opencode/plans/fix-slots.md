# Fix: Slots no aparecen en booking público

## Archivo 1: `src/lib/dashboard/public-booking-actions.ts`

### Cambio A — Guard de duración (punto crítico)
Agregar al inicio de `fetchPublicAvailableSlots`, después de `const admin = createAdminClient();`:
```ts
const safeDuration = (!serviceDuration || serviceDuration <= 0) ? 60 : serviceDuration;
```
Reemplazar toda ocurrencia de `serviceDuration` dentro de la función por `safeDuration`. Hay 2 usos:
- Línea ~109: `const slotDuration = serviceDuration;` → `const slotDuration = safeDuration;`
- (el otro es en `createArgentinaDate` loop, se usa `slotDuration` que ya toma el valor correcto)

### Cambio B — Eliminar filtro isToday (debug)
Borrar estas líneas (~104-106 y ~121-125):
```ts
const todayAr = getArgentinaDateString();
const currentArMinutes = getArgentinaMinutesSinceMidnight(new Date());
const isToday = date === todayAr;
```
y
```ts
if (isToday) {
  const slotMinutes = hour * 60 + minute;
  if (slotMinutes <= currentArMinutes) continue;
}
```

### Cambio C — Limpiar imports
Borrar `getArgentinaDateString` y `getArgentinaMinutesSinceMidnight` del import de `@/lib/argentina-time`.
La línea queda:
```ts
import { createArgentinaDate, formatArgentinaTime, getArgentinaDayBounds } from "@/lib/argentina-time";
```

---

## Archivo 2: `src/app/book/[slug]/booking-client.tsx`

### Cambio D — Console.log en el cliente
Dentro del `useEffect` que fetchea slots (~líneas 88-104), modificar para que quede:
```ts
useEffect(() => {
  if (selectedService && selectedDate && !fetchedDates.has(formatDate(selectedDate))) {
    setLoadingSlots(true);
    setSelectedSlot(null);
    const staffId = selectedStaff?.id;
    const dateStr = formatDate(selectedDate);
    console.log("[BookingClient] fetching slots — date:", dateStr, "duration:", selectedService.duration_minutes, "staffId:", staffId);
    fetchPublicAvailableSlots(shop.id, selectedService.duration_minutes, dateStr, staffId)
      .then((result) => {
        console.log("[BookingClient] slots received:", result);
        setSlots(result);
        setLoadingSlots(false);
        setFetchedDates((prev) => new Set(prev).add(dateStr));
      })
      .catch((err) => {
        console.error("[BookingClient] fetch slots error:", err);
        setSlots([]);
        setLoadingSlots(false);
      });
  }
}, [selectedService, selectedDate, selectedStaff, shop.id, fetchedDates]);
```

---

## Orden de aplicación
1. `public-booking-actions.ts`: guard de duración (Cambio A)
2. `public-booking-actions.ts`: eliminar isToday (Cambio B)
3. `public-booking-actions.ts`: limpiar imports (Cambio C)
4. `booking-client.tsx`: agregar logs (Cambio D)
5. Ejecutar `npx tsc --noEmit` para verificar que compila
