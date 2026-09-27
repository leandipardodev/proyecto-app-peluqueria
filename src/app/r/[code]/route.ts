import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createRateLimiter, getClientIp } from "@/lib/rate-limiter";
import {
  REFERRAL_CODE_COOKIE,
  createReferralCookieToken,
} from "@/lib/referrals/partner-auth";
import {
  attributeShopToPartner,
  findActivePartnerByCode,
  recordReferralLinkClick,
} from "@/lib/admin/referrals";

const REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const limiter = createRateLimiter({ intervalMs: 60_000, maxRequests: 20 });

function targetUrl(
  request: NextRequest,
  pathname: string,
  params: Record<string, string>,
): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function redirectTo(url: URL, partnerId: string): NextResponse {
  const response = NextResponse.redirect(url);
  response.cookies.set(REFERRAL_CODE_COOKIE, createReferralCookieToken(partnerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REF_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

/**
 * GET /r/<codigo>
 *
 * Es el link que reparte el vendedor. No pasa por el middleware (PROTECTED_PATHS
 * solo cubre /dashboard, /admin y /client) y no toca el flujo de turnos.
 *
 * Que hace:
 *  1. Frena por IP.
 *  2. Busca un vendedor activo con ese codigo. Si no hay, respuesta generica:
 *     no revelamos que codigos existen.
 *  3. Guarda el partner_id en una cookie firmada de 30 dias. Asi el local
 *     queda atribuido aunque el dueño se guarde /book/salon en vez del link.
 *  4. Si el visitante ya tiene local, la atribucion es inmediata y lo mandamos
 *     a su dashboard.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const ip = getClientIp(request);

  const limit = await limiter.check(`referral-link:${ip}`);
  if (!limit.allowed) {
    return NextResponse.redirect(targetUrl(request, "/", { ref: "invalid" }));
  }

  const partner = await findActivePartnerByCode(code);
  if (!partner) {
    return NextResponse.redirect(targetUrl(request, "/", { ref: "invalid" }));
  }

  // Si el visitante ya tiene un local, no hace falta esperar al alta: se
  // atribuye ahora y se lo manda a su dashboard.
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: membership } = await supabase
        .from("shop_memberships")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("role", ["owner", "admin", "staff"])
        .limit(1)
        .maybeSingle();

      const shopId = (membership as { shop_id?: string } | null)?.shop_id;
      if (shopId) {
        const result = await attributeShopToPartner({ shopId, partnerId: partner.id });
        await recordReferralLinkClick({
          partnerId: partner.id,
          shopId,
          code: partner.referral_code,
          outcome: result.outcome,
        });

        if (result.outcome === "attributed") {
          return redirectTo(targetUrl(request, "/dashboard", { ref: "ok" }), partner.id);
        }
      }
    }
  } catch {
    // Si no se puede resolver la sesion, seguimos con la cookie seteada: la
    // atribucion queda para cuando cree el local.
  }

  return redirectTo(targetUrl(request, "/register", { ref: "1" }), partner.id);
}
