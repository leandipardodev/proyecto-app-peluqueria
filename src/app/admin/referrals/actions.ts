"use server";

import { revalidatePath } from "next/cache";
import {
  regeneratePartnerPin,
  updateReferralPartnerPayout,
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
