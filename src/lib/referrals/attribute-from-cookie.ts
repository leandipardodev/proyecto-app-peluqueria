import "server-only";
import {
  attributeShopToPartner,
  recordReferralLinkClick,
  type ReferralLinkOutcome,
} from "@/lib/admin/referrals";
import { verifyReferralCookieToken } from "@/lib/referrals/partner-auth";

/**
 * Atribucion de un alta que viene de un link /r/<codigo>.
 *
 * El link guarda el partner_id en una cookie firmada de 30 dias. Cuando el
 * local se crea hay que leerla y cerrar la atribucion. Esta vive aqui, y no en
 * cada ruta de alta, porque hay DOS caminos que crean un local y solo uno de los
 * dos se acordaba de hacerlo:
 *
 *   - Google OAuth  -> src/app/auth/callback/route.ts
 *   - Email + pass  -> src/lib/dashboard/auth/actions.ts (completeRegistration)
 *
 * Cuando solo existed el primero, todo local registrado con email desde un link
 * de vendedor se quedaba sin atribucion y sin comision, en silencio: el
 * vendedor veia "0 locales" y no habia ningun error en ningun lado.
 *
 * Recibe el valor crudo de la cookie y no un NextRequest a proposito: el camino
 * de OAuth tiene request, pero una server action solo tiene la cookie store.
 *
 * No borra la cookie: si el local se creara igual, el link sigue siendo
 * reintentable.
 */
export async function attributeShopFromReferralCookie(input: {
  shopId: string;
  cookieValue: string | undefined | null;
}): Promise<ReferralLinkOutcome | null> {
  try {
    const partnerId = verifyReferralCookieToken(input.cookieValue);
    if (!partnerId) return null;

    const result = await attributeShopToPartner({ shopId: input.shopId, partnerId });
    if (result.outcome === "not_a_shop" || !result.code) return null;

    await recordReferralLinkClick({
      partnerId,
      shopId: input.shopId,
      code: result.code,
      outcome: result.outcome,
    });

    return result.outcome;
  } catch (error) {
    // El referidos nunca puede bloquear un alta. Si esta caido, el local se
    // crea igual y la atribucion queda pendiente para el proximo intento.
    console.error("[referrals] attribution from cookie failed:", error);
    return null;
  }
}