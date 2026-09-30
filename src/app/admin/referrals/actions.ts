"use server";

import { revalidatePath } from "next/cache";
import {
  markReferralLedgerRowsPaid,
  regeneratePartnerPin,
  resolveNeedsReviewLedgerRow,
  updateReferralPartnerPayout,
  upsertReferralPartner,
} from "@/lib/admin/referrals";

export type PartnerPinState = { pin: string; error?: undefined } | { error: string; pin?: undefined } | null;

export async function regeneratePartnerPinAction(
  _prev: PartnerPinState,
  formData: FormData,
): Promise<PartnerPinState> {
  const partnerId = String(formData.get("partnerId") || "").trim();
  if (!partnerId) return { error: "Falta el vendedor" };

  const result = await regeneratePartnerPin(partnerId);
  if (!result.success || !result.pin) {
    return { error: result.error || "No se pudo generar el PIN" };
  }

  revalidatePath("/admin/referrals");
  return { pin: result.pin };
}

export type CreatePartnerState =
  | { ok: true; name: string; referralCode: string; pin: string }
  | { ok: false; error: string };

/**
 * Alta de vendedor en un solo paso.
 *
 * Antes el PIN se generaba, se devolvia y `createPartnerAction` lo descartaba
 * al redirigir: el admin solo veía los ultimos 4 digitos y tenia que apretar
 * "Generar PIN" aparte. Cada vendedor nuevo arrancaba con una credencial muerta.
 * Ahora el PIN vuelve en la respuesta y se muestra una sola vez, junto al link.
 */
export async function createPartnerAction(
  _prev: CreatePartnerState | null,
  formData: FormData,
): Promise<CreatePartnerState> {
  const name = String(formData.get("name") || "").trim();
  const referralCode = String(formData.get("referralCode") || "").trim();

  const result = await upsertReferralPartner({
    name,
    email: String(formData.get("email") || "") || null,
    phone: String(formData.get("phone") || "") || null,
    referralCode,
    commissionPercentOverride: formData.get("commissionPercentOverride")
      ? Number(formData.get("commissionPercentOverride"))
      : null,
    commissionMonthsOverride: formData.get("commissionMonthsOverride")
      ? Number(formData.get("commissionMonthsOverride"))
      : null,
    isActive: true,
  });

  if (!result.success) return { ok: false, error: result.error || "No se pudo crear el vendedor" };
  if (!result.generatedPin) {
    return { ok: false, error: "El vendedor se creo pero no se genero el PIN. Regeneralo desde la fila." };
  }

  revalidatePath("/admin/referrals");
  return { ok: true, name, referralCode: referralCode.toLowerCase(), pin: result.generatedPin };
}

export type PartnerPayoutState =
  | { saved: true; error?: undefined }
  | { error: string; saved?: undefined }
  | null;

export async function savePartnerPayoutAction(
  _prev: PartnerPayoutState,
  formData: FormData,
): Promise<PartnerPayoutState> {
  const partnerId = String(formData.get("partnerId") || "").trim();
  if (!partnerId) return { error: "Falta el vendedor" };

  const result = await updateReferralPartnerPayout({
    partnerId,
    payoutAlias: String(formData.get("payoutAlias") || "") || null,
    payoutCbu: String(formData.get("payoutCbu") || "") || null,
  });

  if (!result.success) return { error: result.error || "No se pudo guardar" };

  revalidatePath("/admin/referrals");
  return { saved: true };
}

export type MarkPaidState =
  | { paid: true; count: number; amount: number; error?: undefined }
  | { error: string; paid?: undefined; count?: undefined; amount?: undefined }
  | null;

/**
 * Marca como pagadas las transferencias marcadas.
 *
 * Acepta varias filas a proposito: el modelo de pago acordado es una
 * transferencia por local y por mes, asi que un mes con diez locales son diez
 * filas. El boton viejo por vendedor pagaba TODO lo pendiente de una vez, sin
 * confirmacion, y contradecía el texto de la tabla.
 */
export async function markTransfersPaidAction(
  _prev: MarkPaidState,
  formData: FormData,
): Promise<MarkPaidState> {
  const ledgerIds = formData
    .getAll("ledgerId")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (ledgerIds.length === 0) return { error: "Marcá al menos una transferencia" };

  const result = await markReferralLedgerRowsPaid(ledgerIds);
  if (!result.success) return { error: result.error || "No se pudo marcar" };

  revalidatePath("/admin/referrals");
  return { paid: true, count: result.items ?? ledgerIds.length, amount: result.amount ?? 0 };
}

export type ResolveReviewState =
  | { saved: true; commission?: number; error?: undefined }
  | { error: string; saved?: undefined }
  | null;

/** Cierra un pago sin neto conocido con el monto verificado en Mercado Pago. */
export async function resolveNeedsReviewAction(
  _prev: ResolveReviewState,
  formData: FormData,
): Promise<ResolveReviewState> {
  const ledgerId = String(formData.get("ledgerId") || "").trim();
  const netAmount = Number(String(formData.get("netAmount") || "").replace(",", "."));

  if (!ledgerId) return { error: "Falta la comisión" };
  if (!Number.isFinite(netAmount)) return { error: "Cargá el neto que entró a Klip" };

  const result = await resolveNeedsReviewLedgerRow({ ledgerId, netAmount });
  if (!result.success) return { error: result.error || "No se pudo resolver" };

  revalidatePath("/admin/referrals");
  return { saved: true, commission: result.commissionAmount };
}
