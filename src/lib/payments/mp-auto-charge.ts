import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago";
import {
  extractMpAppliedAmounts,
  pickAutoChargePayment,
  type MpAppliedAmounts,
} from "@/lib/payments/mp-amounts";

export type ResolvedAutoCharge = {
  paymentId: string | null;
  amounts: MpAppliedAmounts | null;
  liveMode: boolean | null;
};

/** Tolerancia al comparar el bruto del pago con el monto recurrente del plan. */
const AMOUNT_TOLERANCE_PCT = 0.01;

function amountsMatch(expected: number | undefined, gross: number): boolean {
  if (!Number.isFinite(expected as number) || (expected as number) <= 0) return true;
  const diff = Math.abs(gross - (expected as number));
  return diff <= Math.max(1, (expected as number) * AMOUNT_TOLERANCE_PCT);
}

/**
 * Resuelve los montos reales de un cobro automatico de suscripcion.
 *
 * El webhook de `subscription_charged` solo trae el id del preapproval, y el
 * PreApproval de MP NO expone el pago del ultimo cobro: expone
 * `summarized.last_charged_amount`, que es el bruto sin fee. Como la comision de
 * referidos se calcula sobre el neto, hace falta ir a buscar el pago.
 *
 * Todas las suscripciones de un local comparten
 * external_reference ("shop_sub_auto:<shopId>"), asi que la busqueda devuelve
 * todos los cobros de ese local y hay que elegir el de ESTE evento.
 *
 * Si algo no cierra, se devuelve `amounts: null` a proposito: el sync lo marca
 * needs_review. Devolver un neto aproximado seria peor que pedir revision
 * manual, porque se paga al vendedor sobre un numero inventado.
 */
export async function resolveAutoChargeAmounts({
  accessToken,
  preapprovalId,
  externalReference,
}: {
  accessToken: string;
  preapprovalId: string;
  externalReference: string;
}): Promise<ResolvedAutoCharge> {
  const empty: ResolvedAutoCharge = { paymentId: null, amounts: null, liveMode: null };
  const mp = new MercadoPagoConfig({ accessToken });

  let chargedAt: string | null = null;
  let expectedGross: number | undefined;

  try {
    // Ojo: .get() devuelve la respuesta del recurso directo, no envuelta.
    const preapproval = await new PreApproval(mp).get({ id: preapprovalId });
    chargedAt = preapproval?.summarized?.last_charged_date ?? null;
    expectedGross = preapproval?.auto_recurring?.transaction_amount ?? undefined;
  } catch {
    // Sin el preapproval seguimos con la busqueda sin ventana ni monto esperado.
  }

  try {
    const { results } = await new Payment(mp).search({
      options: {
        external_reference: externalReference,
        sort: "date_approved",
        criteria: "desc",
        limit: 20,
        ...dateWindow(chargedAt),
      },
    });

    const payment = pickAutoChargePayment(
      (results ?? []) as Array<{
        id?: string;
        date_approved?: string | null;
        date_created?: string | null;
        status?: string | null;
        transaction_amount?: number;
        net_amount?: number | null;
        fee_details?: Array<{ type?: string | null; amount?: number | null; fee_payer?: string | null }> | null;
        live_mode?: boolean;
      }>,
      chargedAt,
    );

    if (!payment?.id) return empty;

    const amounts = extractMpAppliedAmounts({
      transaction_amount: payment.transaction_amount,
      net_amount: payment.net_amount,
      fee_details: payment.fee_details,
    });

    // El pago encontrado no es el cobro de este preapproval: no lo usamos.
    if (!amounts || !amountsMatch(expectedGross, amounts.gross_amount)) return empty;

    return { paymentId: payment.id, amounts, liveMode: payment.live_mode ?? null };
  } catch {
    return empty;
  }
}

/**
 * Ventana de busqueda alrededor de la fecha del cobro. Amplia a proposito:
 * la hora que reporta MP para el cobro y la del webhook no siempre coinciden,
 * y como despues se valida el monto, un rango amplio no mete pagos falsos.
 */
function dateWindow(chargedAt: string | null): { begin_date?: string; end_date?: string } {
  const at = chargedAt ? Date.parse(chargedAt) : NaN;
  if (!Number.isFinite(at)) return {};

  const pad = 1000 * 60 * 60 * 6;
  return {
    begin_date: new Date(at - pad).toISOString(),
    end_date: new Date(at + pad).toISOString(),
  };
}
