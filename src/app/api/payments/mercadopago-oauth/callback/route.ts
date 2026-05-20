import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import crypto from "crypto";

function dashboardUrl(baseUrl: string, slug?: string | null, status?: string) {
  const url = new URL(slug ? `/dashboard/${slug}/business` : "/dashboard/business", baseUrl);
  if (status) url.searchParams.set("mp", status);
  return url;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_oauth"));
  }

  if (!code || !state) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_state"));
  }

  let shopId = "";
  try {
    const [payload, sig] = state.split(".");
    if (!payload || !sig) {
      return NextResponse.redirect(dashboardUrl(url.origin, null, "error_state"));
    }

    const stateSecret =
      process.env.MP_OAUTH_STATE_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      process.env.JWT_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "klip-mp-state-fallback";

    const expectedSig = crypto.createHmac("sha256", stateSecret).update(payload).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return NextResponse.redirect(dashboardUrl(url.origin, null, "error_state"));
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { shopId?: string; ts?: number };
    if (!decoded.ts || Math.abs(Date.now() - decoded.ts) > 1000 * 60 * 15) {
      return NextResponse.redirect(dashboardUrl(url.origin, null, "error_state"));
    }

    shopId = decoded.shopId || "";
  } catch {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_state"));
  }

  if (!shopId) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_state"));
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_auth"));
  }

  const admin = await createServiceRoleClient();
  const { data: membership } = await admin
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();

  const canManage = membership?.is_active && (membership.role === "owner" || membership.role === "admin");
  if (!canManage) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_access"));
  }

  const clientId =
    process.env.MP_OAUTH_CLIENT_ID ||
    process.env.MP_CLIENT_ID ||
    process.env.NEXT_PUBLIC_MP_OAUTH_CLIENT_ID ||
    process.env.NEXT_PUBLIC_MP_CLIENT_ID;
  const clientSecret =
    process.env.MP_OAUTH_CLIENT_SECRET ||
    process.env.MP_CLIENT_SECRET ||
    process.env.MERCADOPAGO_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/payments/mercadopago-oauth/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_env"));
  }

  const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_token"));
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string; public_key?: string };
  if (!tokenData.access_token) {
    return NextResponse.redirect(dashboardUrl(url.origin, null, "error_token"));
  }

  const { data: shop } = await admin.from("shops").select("slug").eq("id", shopId).maybeSingle();

  const { error } = await admin
    .from("shops")
    .update({
      mp_access_token: tokenData.access_token,
      mp_public_key: tokenData.public_key || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);

  if (error) {
    return NextResponse.redirect(dashboardUrl(url.origin, shop?.slug || null, "error_save"));
  }

  return NextResponse.redirect(dashboardUrl(url.origin, shop?.slug || null, "connected"));
}
