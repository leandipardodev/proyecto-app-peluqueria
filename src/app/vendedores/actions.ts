"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticatePartner, getPartnerSession, saveOwnPayoutDetails } from "@/lib/referrals/partner-portal";
import { PARTNER_SESSION_COOKIE } from "@/lib/referrals/partner-auth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type PartnerLoginState = { error: string } | null;

export async function loginPartnerAction(
  _prev: PartnerLoginState,
  formData: FormData,
): Promise<PartnerLoginState> {
  const code = String(formData.get("code") ?? "");
  const pin = String(formData.get("pin") ?? "");

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";

  const result = await authenticatePartner(code, pin, ip);
  if (!result.ok) return { error: result.error };

  const store = await cookies();
  store.set(PARTNER_SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect("/vendedores");
}

export async function logoutPartnerAction(): Promise<void> {
  const store = await cookies();
  store.set(PARTNER_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  redirect("/vendedores/acceso");
}

export type OwnPayoutState = { saved: true; error?: undefined } | { error: string; saved?: undefined } | null;

/**
 * El partnerId sale de la sesion firmada, nunca del formulario. Si se leyera del
 * formData, un vendedor podria cambiar el id oculto y escribir los datos de
 * cobro de otro.
 */
export async function saveOwnPayoutAction(
  _prev: OwnPayoutState,
  _formData: FormData,
): Promise<OwnPayoutState> {
  const session = await getPartnerSession();
  if (!session) return { error: "Tu sesión venció. Entrá de nuevo." };

  const result = await saveOwnPayoutDetails(session.partnerId, {
    payoutAlias: String(_formData.get("payoutAlias") ?? ""),
    payoutCbu: String(_formData.get("payoutCbu") ?? ""),
  });

  if (!result.success) return { error: result.error || "No se pudieron guardar los datos de cobro" };
  return { saved: true };
}
