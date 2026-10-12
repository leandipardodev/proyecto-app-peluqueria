/**
 * A que turnos hay que desmarcar cuando se reembolsa un pago.
 *
 * Vive fuera de `mercadopago-actions.ts` a proposito: ese archivo es
 * `"use server"` y en un modulo asi todo export tiene que ser una Server
 * Action async. Esta funcion es pura y se testea directo.
 */

export type RefundLogRow = { payload: unknown } | null | undefined;

/**
 * Un pago de combo o de carrito es UNA preferencia de Mercado Pago que cubre
 * VARIOS turnos, y `refund.total()` devuelve el 100% de ese pago. Desmarcar solo
 * el turno principal devolvia la plata de todos y dejaba a los demas contando
 * como cobrados.
 *
 * El set lo deja el webhook en `paid_appointment_ids` (metadata del pago que
 * calcula el servidor al crear la preferencia; la lista que mandaba el cliente
 * no se usa porque permitia colar servicios sin pagar). Para preferencias
 * anteriores a ese payload cae en el turno principal.
 *
 * Solo mira logs del MISMO pago: el log de otro pago no dice nada de este.
 */
export function resolveRefundAppointmentIds({
  paymentId,
  principalId,
  logs,
}: {
  paymentId: string;
  principalId: string;
  logs: RefundLogRow[];
}): string[] {
  const ids = new Set<string>([principalId]);
  for (const row of logs) {
    if (!row) continue;
    const payload = row.payload as { payment_id?: string; paid_appointment_ids?: unknown } | null;
    if (!payload || typeof payload !== "object" || payload.payment_id !== paymentId) continue;
    const parsed = payload.paid_appointment_ids;
    if (!Array.isArray(parsed)) continue;
    for (const id of parsed) if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}