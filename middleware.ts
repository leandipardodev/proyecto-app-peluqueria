import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { createClient } from "@supabase/supabase-js";

const LOGIN_PATH = "/login";
const BILLING_REQUIRED_PATH = "/billing-required";
const LANDING_PATH = "/landing";
const ACTIVE_SHOP_ID_COOKIE = "klip_active_shop_id";
const ACTIVE_SHOP_SLUG_COOKIE = "klip_active_shop_slug";

const PROTECTED_PATHS = ["/dashboard", "/admin", "/client"];
const PUBLIC_PATHS = ["/login", "/register", "/api/health", "/billing-required", "/book"];
const DASHBOARD_LEGACY_SEGMENTS = new Set([
  "appointments",
  "business",
  "calendar",
  "customers",
  "finances",
  "inventory",
  "profile",
  "services",
  "settings",
  "staff",
  "vouchers",
]);

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".")
  );
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSlugRewriteRequest = request.headers.get("x-klip-slug-rewrite") === "1";

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }


  let response = NextResponse.next();
  const supabase = createMiddlewareClient(request, response);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: userProfile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !userProfile) {
    const billingUrl = request.nextUrl.clone();
    billingUrl.pathname = BILLING_REQUIRED_PATH;
    return NextResponse.redirect(billingUrl);
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
  const { data: memberships } = await supabase
    .from("shop_memberships")
    .select("shop_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "staff"]);

  const activeMemberships = memberships ?? [];
  if (activeMemberships.length === 0) {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = LANDING_PATH;
    return NextResponse.redirect(landingUrl);
  }

  const shopIds = activeMemberships.map((m) => m.shop_id);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let accessibleShops: Array<{ id: string; slug: string; active: boolean; plan_expiry: string | null }> | null = null;

  if (serviceRoleKey && supabaseUrl) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await admin
      .from("shops")
      .select("id, slug, active, plan_expiry")
      .in("id", shopIds);
    accessibleShops = data;
  } else {
    const { data } = await supabase
      .from("shops")
      .select("id, slug, active, plan_expiry")
      .in("id", shopIds);
    accessibleShops = data;
  }

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

  const hasDashboardRole = ["owner", "admin", "staff"].includes(userProfile.role);
  if (!hasDashboardRole || !preferredShopId || !preferredShopSlug) {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = LANDING_PATH;
    return NextResponse.redirect(landingUrl);
  }

  const hasShopSlugInPath = Boolean(
    parts[0] === "dashboard" &&
    slugCandidate &&
    !DASHBOARD_LEGACY_SEGMENTS.has(slugCandidate)
  );

  const hasLegacyDashboardPath =
    parts[0] === "dashboard" &&
    (!slugCandidate || DASHBOARD_LEGACY_SEGMENTS.has(slugCandidate));

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
      const landingUrl = request.nextUrl.clone();
      landingUrl.pathname = LANDING_PATH;
      return NextResponse.redirect(landingUrl);
    }

    if (slugCandidate && slugCandidate !== targetShop.slug) {
      const canonicalUrl = request.nextUrl.clone();
      const tail = parts.slice(2).join("/");
      canonicalUrl.pathname = tail
        ? `/dashboard/${targetShop.slug}/${tail}`
        : `/dashboard/${targetShop.slug}`;
      return NextResponse.redirect(canonicalUrl);
    }

    const now = new Date();
    const planExpiry = targetShop.plan_expiry ? new Date(targetShop.plan_expiry) : null;
    const graceUntil = planExpiry ? new Date(planExpiry.getTime() + 2 * 24 * 60 * 60 * 1000) : null;
    const outOfBilling = !targetShop.active || (graceUntil ? graceUntil <= now : false);

    if (outOfBilling) {
      const billingUrl = request.nextUrl.clone();
      billingUrl.pathname = BILLING_REQUIRED_PATH;
      return NextResponse.redirect(billingUrl);
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
