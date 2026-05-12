import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

const LOGIN_PATH = "/login";
const BILLING_REQUIRED_PATH = "/billing-required";

const PROTECTED_PATHS = ["/dashboard", "/admin", "/client"];
const PUBLIC_PATHS = ["/login", "/register", "/api/health", "/billing-required", "/book"];

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

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
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
    .select("shop_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !userProfile) {
    const billingUrl = request.nextUrl.clone();
    billingUrl.pathname = BILLING_REQUIRED_PATH;
    return NextResponse.redirect(billingUrl);
  }

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("active, plan_expiry")
    .eq("id", userProfile.shop_id)
    .single();

  if (
    shopError ||
    !shop ||
    !shop.active ||
    (shop.plan_expiry && new Date(shop.plan_expiry) <= new Date())
  ) {
    const billingUrl = request.nextUrl.clone();
    billingUrl.pathname = BILLING_REQUIRED_PATH;
    return NextResponse.redirect(billingUrl);
  }

  if (
    userProfile.role === "customer" &&
    (pathname.startsWith("/dashboard/staff") ||
      pathname.startsWith("/dashboard/admin"))
  ) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
