/**
 * Cuanta plata hay REALMENTE cobrada por un turno.
 *
 * Por que existe: hasta ahora todos los agregados (KPI de Ingresos, Balance,
 * caja, comisiones, gráficos) sumaban `service_price`, o sea el PRECIO DE LISTA
 * de los turnos marcados como pagados. Con seña eso queda inflado por el factor
 * `service_price / deposit_amount`: un servicio de $40.000 con seña de $3.000
 * reportaba $40.000 de ingreso, y la comisión del profesional se calculaba
 * también sobre $40.000.
 *
 * La regla, en una sola parte para que no se contradigan entre si:
 *
 * - El turno se completo (o el dueno lo marco pagado en el local): el salon
 *   tiene la seña MAS el saldo que cobro en el mostrador. O sea el precio de
 *   lista menos el descuento de fidelidad.
 * - El turno esta reservado y solo se cobro la seña: eso, y nada mas.
 * - Nada cobrado: 0.
 *
 * `is_paid` no cambia de significado: sigue diciendo "este turno cuenta como
 * ingreso". Lo que cambia es CUANTO cuenta.
 */

/** Precio de lista menos el descuento de fidelidad: lo que vale el turno. */
export function fullServiceAmount(
  servicePrice: number | null | undefined,
  loyaltyDiscountPercent?: number | null,
): number {
  const base = Number(servicePrice || 0);
  const discount = Math.max(0, Math.min(100, Number(loyaltyDiscountPercent || 0)));
  return Math.round(base * (1 - discount / 100) * 100) / 100;
}

/**
 * Lo que suma un turno a los ingresos.
 *
 * `depositOnly` = la situacion de un turno reservado con seña: entra la seña y
 * no el saldo, porque el saldo todavia no se cobro. `settled` = el turno ya se
 * hizo o el dueno lo dio por pagado: entra el total.
 */
export function amountPaidFor({
  settled,
  servicePrice,
  depositAmount,
  loyaltyDiscountPercent,
}: {
  settled: boolean;
  servicePrice?: number | null;
  depositAmount?: number | null;
  loyaltyDiscountPercent?: number | null;
}): number {
  if (settled) return fullServiceAmount(servicePrice, loyaltyDiscountPercent);
  return Math.max(0, Number(depositAmount || 0));
}

/**
 * Lee el importe cobrado de una fila de `appointments` y cae a `service_price`
 * cuando `amount_paid` todavia no existe.
 *
 * El fallback NO es opcional: la columna la agrega la migracion 112 y hasta que
 * se aplique, `amount_paid` viene en null para toda fila. Sin el, la app
 * muestra $0 en todos lados.
 */
export function collectedAmount(row: {
  amount_paid?: number | null;
  service_price?: number | null;
  loyalty_discount_percent_applied?: number | null;
  services?: { price?: number | null } | Array<{ price?: number | null }> | null;
}): number {
  if (row.amount_paid != null) return Number(row.amount_paid);
  const svc = Array.isArray(row.services) ? row.services[0] : row.services;
  return fullServiceAmount(row.service_price ?? svc?.price ?? 0, row.loyalty_discount_percent_applied);
}

/**
 * `amount_paid` todavia no esta en `database.types.ts` (esa tabla se genera del
 * schema aplicado, y la migracion 112 esta pendiente). Ademas el cliente de
 * Supabase rechaza en tipos las claves que no conoce, asi que un
 * `{ ...payload, amount_paid }` no compila.
 *
 * El helper devuelve el tipo ORIGINAL del payload, sin la clave nueva: para
 * TypeScript el update es identico a lo que era, y la columna viaja sola. Cuando
 * se aplique la 112 y se regenere los tipos, este cast es el unico lugar que
 * hay que tocar.
 */
export function withAmountPaid<T extends object>(payload: T, amount: number | null | undefined): T {
  if (amount == null || amount <= 0) return payload;
  return { ...payload, amount_paid: amount } as unknown as T;
}