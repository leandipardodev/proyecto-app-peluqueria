import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/shared/legacy-segments";
import { decodeJwtPayload, extractAccessToken } from "@/lib/jwt";
import { getArgentinaDateString, toArgentinaLocalIsoString } from "@/lib/argentina-time";

const LOGIN_PATH = "/login";
const BILLING_REQUIRED_PATH = "/billing-required";
const LANDING_PATH = "/";
const ACTIVE_SHOP_ID_COOKIE = "klip_active_shop_id";
const ACTIVE_SHOP_SLUG_COOKIE = "klip_active_shop_slug";

// Match auth-js EXPIRY_MARGIN_MS. Only let the server client refresh when the
// access token is actually close to expiry; otherwise decode locally and avoid
// racing the browser's autoRefreshToken (Refresh Token Not Found race).
const EXPIRY_MARGIN_MS = 90_000;

const PROTECTED_PATHS = ["/dashboard", "/admin", "/client"];
function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function clearActiveShopCookies(response: NextResponse): NextResponse {
  response.cookies.delete(ACTIVE_SHOP_ID_COOKIE);
  response.cookies.delete(ACTIVE_SHOP_SLUG_COOKIE);
  return response;
}

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

export async function middleware(request: NextRequest) {
  try {
    return await middlewareHandler(request);
  } catch (err) {
    console.error("[middleware] Unhandled error — allowing request through:", err);
    return NextResponse.next();
  }
}

async function middlewareHandler(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSlugRewriteRequest = request.headers.get("x-klip-slug-rewrite") === "1";

  if (!isProtectedPath(pathname)) {
    if (pathname === LOGIN_PATH && !hasSessionCookie(request)) {
      return clearActiveShopCookies(NextResponse.next());
    }
    return NextResponse.next();
  }

  let response = NextResponse.next();
  const supabase = createMiddlewareClient(request, response);

  let user: { id: string } | null = null;

  // If the access token is still fresh, decode it locally instead of calling
  // getUser() — getUser() refreshes near expiry and can race the browser's
  // autoRefreshToken, producing "Invalid Refresh Token" logouts.
  const tokenInfo = extractAccessToken(request.cookies.getAll());
  if (tokenInfo && tokenInfo.expiresAt * 1000 - Date.now() > EXPIRY_MARGIN_MS) {
    const payload = decodeJwtPayload(tokenInfo.accessToken);
    if (typeof payload?.sub === "string") {
      user = { id: payload.sub };
    }
  }

  if (!user) {
    const {
      data: { user: refreshedUser },
    } = await supabase.auth.getUser();
    user = refreshedUser;
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("redirect", pathname);
    return clearActiveShopCookies(NextResponse.redirect(loginUrl));
  }

  const [
    { data: userProfile, error: profileError },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("role, platform_role, is_banned")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("shop_memberships")
      .select("shop_id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"]),
  ]);

  if (profileError) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("error", "Error al cargar tu perfil. Intentá de nuevo.");
    return NextResponse.redirect(loginUrl);
  }

  if (!userProfile) {
    const onboardingUrl = request.nextUrl.clone();
    onboardingUrl.pathname = "/onboarding/create-shop";
    return NextResponse.redirect(onboardingUrl);
  }

  if (userProfile.is_banned) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("error", "banned");
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin")) {
    const platformRole = userProfile.platform_role;
    const legacyRole = userProfile.role;
    const isSuperAdmin = platformRole === "super_admin" || legacyRole === "superadmin";
    if (!isSuperAdmin) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashboardUrl);
    }
    return response;
  }

  if (pathname.startsWith("/dashboard") && userProfile.role === "customer") {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = LANDING_PATH;
    return NextResponse.redirect(landingUrl);
  }

  const needsShopSubscriptionCheck = pathname.startsWith("/dashboard");

  if (!needsShopSubscriptionCheck) {
    return response;
  }

  const parts = pathname.split("/").filter(Boolean);
  const slugCandidate = parts[1] ?? null;
  const activeShopIdCookie = request.cookies.get(ACTIVE_SHOP_ID_COOKIE)?.value || null;
  const activeShopSlugCookie = request.cookies.get(ACTIVE_SHOP_SLUG_COOKIE)?.value || null;

  const activeMemberships = memberships ?? [];
  if (activeMemberships.length === 0) {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = "/onboarding/create-shop";
    return NextResponse.redirect(landingUrl);
  }

  const shopIds = activeMemberships.map((m) => m.shop_id);
  const { data: accessibleShops } = await supabase
    .from("shops")
    .select("id, slug, active, plan_expiry")
    .in("id", shopIds);

  const shops = accessibleShops ?? [];
  const shopBySlug = new Map(shops.map((s) => [s.slug, s]));

  let preferredShopId: string | null = null;
  let preferredShopSlug: string | null = null;

  const preferredShop =
    (activeShopIdCookie ? shops.find((s) => s.id === activeShopIdCookie) : null) ||
    (activeShopSlugCookie ? shops.find((s) => s.slug === activeShopSlugCookie) : null) ||
    shops[0] ||
    null;
  if (preferredShop) {
    preferredShopId = preferredShop.id;
    preferredShopSlug = preferredShop.slug;
  }

  const hasDashboardRole = ["owner", "admin", "staff"].includes(userProfile.role ?? "");
  if (!hasDashboardRole || !preferredShopId || !preferredShopSlug) {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = LANDING_PATH;
    return NextResponse.redirect(landingUrl);
  }

  const hasShopSlugInPath = Boolean(
    parts[0] === "dashboard" &&
    slugCandidate &&
    !DASHBOARD_LEGACY_SEGMENTS_SET.has(slugCandidate)
  );

  const hasLegacyDashboardPath =
    parts[0] === "dashboard" &&
    (!slugCandidate || DASHBOARD_LEGACY_SEGMENTS_SET.has(slugCandidate));

  if (hasLegacyDashboardPath && !isSlugRewriteRequest) {
    const redirectUrl = request.nextUrl.clone();
    const tail = parts[1] ? `/${parts[1]}` : "";
    redirectUrl.pathname = `/dashboard/${preferredShopSlug}${tail}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (hasShopSlugInPath) {
    let targetShop = slugCandidate ? shopBySlug.get(slugCandidate) : null;
    if (!targetShop && slugCandidate) {
      const normalized = slugCandidate.toLowerCase();
      targetShop = shops.find((s) => s.slug.toLowerCase() === normalized) || null;
    }
    if (!targetShop) {
      const destUrl = request.nextUrl.clone();
      destUrl.pathname = "/dashboard";
      return NextResponse.redirect(destUrl);
    }

    const todayStr = getArgentinaDateString();
    const planExpiryStr = targetShop.plan_expiry
      ? toArgentinaLocalIsoString(targetShop.plan_expiry).slice(0, 10)
      : null;
    const planExpired = Boolean(planExpiryStr && planExpiryStr <= todayStr);
    if (!targetShop.active || planExpired) {
      const billingUrl = request.nextUrl.clone();
      billingUrl.pathname = BILLING_REQUIRED_PATH;
      billingUrl.searchParams.set("shop_id", targetShop.id);
      return NextResponse.redirect(billingUrl);
    }

    if (slugCandidate && slugCandidate !== targetShop.slug) {
      const canonicalUrl = request.nextUrl.clone();
      const tail = parts.slice(2).join("/");
      canonicalUrl.pathname = tail
        ? `/dashboard/${targetShop.slug}/${tail}`
        : `/dashboard/${targetShop.slug}`;
      return NextResponse.redirect(canonicalUrl);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-shop-id", targetShop.id);
    requestHeaders.set("x-shop-slug", targetShop.slug);
    requestHeaders.set("x-klip-slug-rewrite", "1");

    response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.cookies.set(ACTIVE_SHOP_ID_COOKIE, targetShop.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set(ACTIVE_SHOP_SLUG_COOKIE, targetShop.slug, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
