type MpFeeDetail = { type?: string | null; amount?: number | null; fee_payer?: string | null };

type MpAmountsSource = {
  transaction_amount?: number | null;
  amount?: number | null;
  net_amount?: number | null;
  fee_details?: MpFeeDetail[] | null;
  taxes_amount?: number | null;
  shipping_amount?: number | null;
};

export type MpAppliedAmounts = {
  gross_amount: number;
  mp_fee: number;
  net_amount: number;
  /** De donde salio el neto. Queda en el ledger como amount_source. */
  source: "mp_net_amount" | "mp_fee_details";
};

/**
 * Cuanto entra realmente a la cuenta de Klip por un pago de Mercado Pago.
 *
 * La comision del referidos se calcula sobre esto, no sobre el precio del plan:
 * si MP se come 1.400, el vendedor cobra 40.000 - 1.400.
 *
 * Prioridad de datos:
 *  1. `net_amount` que devuelve MP. Es el dato mas fiel cuando viene.
 *  2. `fee_details` sumando las comisiones que paga el cobrador (fee_payer
 *     distinto de 'platform'). Sirve para tarjetas, que es lo mayoritario.
 *
 * Si no hay ninguna de las dos devuelve null: es preferible que el sync aplique
 * el fee de fallback configurado a que se pague la comision sobre el bruto sin
 * saber cuanto sediscounto.
 *
 * Los impuestos y el envio no se tocan: la base es lo que el local pago por la
 * suscripcion, no el total del cargo.
 */
export function extractMpAppliedAmounts(payment: MpAmountsSource): MpAppliedAmounts | null {
  const gross = Number(payment.transaction_amount ?? payment.amount);
  if (!Number.isFinite(gross) || gross <= 0) return null;

  //net_amount ausente y net_amount = 0 en cero. Un pago con el fee al 100% (o
  //totalmente bonificado) tiene neto 0 y ese es un dato VALIDO: la comision es
  // 0. Con truthiness caia a fee_details y terminaba en null, que el sync
  // translate en "usar el fee de fallback" y pagar de mas.
  const hasExplicitNet = payment.net_amount !== undefined && payment.net_amount !== null;
  const explicitNet = Number(payment.net_amount);
  if (hasExplicitNet && Number.isFinite(explicitNet) && explicitNet >= 0 && explicitNet <= gross) {
    return {
      gross_amount: round2(gross),
      mp_fee: round2(gross - explicitNet),
      net_amount: round2(explicitNet),
      source: "mp_net_amount",
    };
  }

  const details = payment.fee_details;
  if (Array.isArray(details) && details.length > 0) {
    const fee = details.reduce((acc, detail) => {
      // 'platform' lo paga MP, no Klip: no lo descontamos.
      if (String(detail.fee_payer ?? "").toLowerCase() === "platform") return acc;
      const amount = Number(detail.amount);
      if (!Number.isFinite(amount) || amount <= 0) return acc;
      return acc + amount;
    }, 0);

    if (fee > 0) {
      return {
        gross_amount: round2(gross),
        mp_fee: round2(fee),
        // Nunca negativo: si MP reporta mas fee que el cargo, se reporta el
        // bruto y no hay bursting de comisiones.
        net_amount: round2(Math.max(0, gross - fee)),
        source: "mp_fee_details",
      };
    }
  }

  return null;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

type AutoChargeCandidate = {
  id?: string;
  date_approved?: string | null;
  date_created?: string | null;
  status?: string | null;
};

/**
 * El webhook de `subscription_charged` llega con el id del PREAPPROVAL, no con
 * el del pago. Para cobrar bien hay que ir a buscar el pago real, y la forma de
 * hacerlo es buscar por external_reference, que en las suscripciones automaticas
 * es el MISMO para todos los cobros ("shop_sub_auto:<shopId>").
 *
 * O sea que la busqueda devuelve TODOS los cobros de esa suscripcion, y hay que
 * elegir el de ESTE evento. Si se elige mal, se cobra la comision sobre el neto
 * de un pago distinto del que se esta liquidando.
 *
 * Por eso esto es puro y esta testeado aparte: la eleccion es lo unico que no
 * se puede dejar en manos de MP.
 */
export function pickAutoChargePayment<T extends AutoChargeCandidate>(
  candidates: T[],
  chargedAtIso: string | null | undefined,
): T | null {
  const usable = candidates.filter(
    (c) =>
      c.id &&
      (c.status === undefined || c.status === null || c.status === "approved"),
  );

  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0];

  const target = chargedAtIso ? Date.parse(chargedAtIso) : NaN;
  const stamp = (c: T) => {
    const raw = c.date_approved || c.date_created;
    return raw ? Date.parse(raw) : NaN;
  };

  if (Number.isFinite(target)) {
    let best: T | null = null;
    let bestDistance = Infinity;

    for (const c of usable) {
      const at = stamp(c);
      if (!Number.isFinite(at)) continue;
      const distance = Math.abs(at - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = c;
      }
    }

    if (best) return best;
  }

  // Sin fecha conocida: el cobro aprobado mas reciente es la mejor apuesta.
  const dated = usable
    .map((c) => ({ c, at: stamp(c) }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => b.at - a.at);

  if (dated.length > 0) return dated[0].c;

  // Ningun candidato tiene fecha parseable. Se devuelve el primero utilizable en
  // vez de null: perder un pago real y mandarlo a needs_review es peor que
  // acotar el riesgo al chequeo de monto que hace el llamador.
  return usable[0];
}
