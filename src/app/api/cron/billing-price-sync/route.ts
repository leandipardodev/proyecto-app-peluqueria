/**
 * Que los clientes ya suscritos paguen el precio vigente.
 *
 * QUE PASABA
 * ----------
 * El monto del preapproval se manda UNA SOLA VEZ, cuando se crea
 * (`billing/subscription/activate/route.ts`): `transaction_amount: getBillingPrice()`.
 * No habia ninguna ruta que lo actualizara.
 *
 *   - El precio ya cambio dos veces (25000 -> 9500 -> 15000, segun el propio
 *     codigo). Cada vez que bajo el precio, los clientes que ya estaban
 *     suscritos seguian pagando el viejo, indefinidamente.
 *   - La pantalla de Facturacion del local muestra `getBillingPrice()`, el
 *     checkout cobra `getBillingPrice()`, y el auto-cobra de los suscritos cobra
 *     lo que se congelo al suscribirse. Tres numeros, uno solo correcto.
 *
 * QUE HACE ESTE
 * --------------
 * Compara el precio vigente contra el `transaction_amount` de cada preapproval
 * activo y, si difieren, actualiza el preapproval. Despues de esto, el proximo
 * auto-cobra usa el precio de hoy.
 *
 * El update puede fallar (MP a veces pide reautorizacion del pagador al cambiar
 * el monto). Un fallo NO se toca la suscripcion ni se cancela nada: se registra
 * y se sigue con el siguiente local. Peor es romperle el cobro a un cliente que
 * esta pagando.
 *
 * Idempotente: si el precio ya coincide, no hace nada.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { getBillingPrice } from "@/lib/admin/site-settings";
import { createLogContext, logInfo, logWarn, logError } from "@/lib/api-logger";

type PreapprovalLike = {
  id?: string | null;
  auto_recurring?: { transaction_amount?: number | null } | null;
  status?: string | null;
};

type SyncResult = {
  shopId: string;
  preapprovalId: string;
  previous: number;
  current: number;
  status: "synced" | "already_current" | "failed";
  error?: string;
};

/** Redondea a centavos: comparar floats crudos da falsos positivos. */
const aCentavos = (n: number) => Math.round(n * 100) / 100;

/** Diff de precio de una suscripcion, testeable sin Mercado Pago. */
export function needsPriceSync(preapprovalAmount: number | null | undefined, currentPrice: number): boolean {
  if (preapprovalAmount == null) return false;
  if (!Number.isFinite(preapprovalAmount) || preapprovalAmount <= 0) return false;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false;
  return Math.abs(aCentavos(preapprovalAmount) - aCentavos(currentPrice)) > 0;
}

export async function GET(request: Request) {
  const log = createLogContext("GET", "/api/cron/billing-price-sync");
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || !auth || !auth.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const expected = `Bearer ${secret}`;
  const actual = auth;
  if (expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "MP_ACCESS_TOKEN no configurado" }, { status: 500 });
    }

    const admin = await createServiceRoleClient();
    const currentPrice = await getBillingPrice();

    const { data: subs, error: subsError } = await admin
      .from("shop_subscriptions")
      .select("shop_id, preapproval_id, status")
      .eq("status", "authorized")
      .not("preapproval_id", "is", null)
      .limit(500);

    if (subsError) return NextResponse.json({ ok: false, error: subsError.message }, { status: 500 });

    const client = new MercadoPagoConfig({ accessToken: token });
    const preapproval = new PreApproval(client);
    const results: SyncResult[] = [];

    for (const sub of subs || []) {
      const preapprovalId = String(sub.preapproval_id || "");
      if (!preapprovalId) continue;

      let remote: PreapprovalLike | null = null;
      try {
        remote = (await preapproval.get({ id: preapprovalId })) as PreapprovalLike;
      } catch (e) {
        const message = e instanceof Error ? e.message : "error desconocido";
        results.push({
          shopId: sub.shop_id,
          preapprovalId,
          previous: 0,
          current: currentPrice,
          status: "failed",
          error: `no se pudo leer el preapproval: ${message}`,
        });
        continue;
      }

      const remoteAmount = Number(remote?.auto_recurring?.transaction_amount ?? 0);
      if (!needsPriceSync(remoteAmount, currentPrice)) {
        results.push({
          shopId: sub.shop_id,
          preapprovalId,
          previous: remoteAmount,
          current: currentPrice,
          status: "already_current",
        });
        continue;
      }

      try {
        await preapproval.update({
          id: preapprovalId,
          auto_recurring: { transaction_amount: currentPrice },
        } as never);

        await admin.from("shop_billing_events").insert({
          shop_id: sub.shop_id,
          actor_user_id: null,
          event_type: "subscription_price_synced",
          payload: {
            preapproval_id: preapprovalId,
            previous_amount: remoteAmount,
            new_amount: currentPrice,
          },
        });

        logInfo(log, "Precio de suscripción sincronizado", {
          shop_id: sub.shop_id,
          preapproval_id: preapprovalId,
          previous_amount: remoteAmount,
          new_amount: currentPrice,
        });
        results.push({
          shopId: sub.shop_id,
          preapprovalId,
          previous: remoteAmount,
          current: currentPrice,
          status: "synced",
        });
      } catch (e) {
        // El pago del local NO se toca. Solo se avisa: si MP pide reautorizar al
        // pagador, hay que resolverlo con el cliente, no romperle el cobro.
        const message = e instanceof Error ? e.message : "error desconocido";
        logWarn(log, "No se pudo actualizar el precio del preapproval; el local sigue con el precio anterior", {
          shop_id: sub.shop_id,
          preapproval_id: preapprovalId,
          previous_amount: remoteAmount,
          expected_amount: currentPrice,
          error: message,
        });
        results.push({
          shopId: sub.shop_id,
          preapprovalId,
          previous: remoteAmount,
          current: currentPrice,
          status: "failed",
          error: message,
        });
      }
    }

    const synced = results.filter((r) => r.status === "synced").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const current = results.filter((r) => r.status === "already_current").length;

    if (failed > 0) {
      logError(log, "Hay suscripciones cuyo precio no se pudo sincronizar", { failed, total: results.length });
    }

    return NextResponse.json({
      ok: true,
      currentPrice,
      scanned: results.length,
      synced,
      alreadyCurrent: current,
      failed,
      results,
    });
  } catch (error) {
    logError(log, "billing-price-sync cron falló", error);
    return NextResponse.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}