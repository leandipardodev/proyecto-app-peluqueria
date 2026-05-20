import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireOwnerShopId } from "@/lib/dashboard/auth-server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  const redirectToBusiness = (status: string) => {
    const out = new URL("/dashboard/business", siteUrl);
    out.searchParams.set("mp", status);
    return NextResponse.redirect(out);
  };

  const shopIdResult = await requireOwnerShopId();
  if (!shopIdResult.success || !shopIdResult.data) {
    return redirectToBusiness("error_access");
  }

  const clientId = process.env.MP_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_MP_OAUTH_CLIENT_ID;
  if (!clientId) return redirectToBusiness("error_env");

  const stateSecret = process.env.MP_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stateSecret) return redirectToBusiness("error_env");

  const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/payments/mercadopago-oauth/callback`;
  const payload = Buffer.from(JSON.stringify({ shopId: shopIdResult.data, ts: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret).update(payload).digest("base64url");
  const statePayload = `${payload}.${sig}`;

  const authUrl = new URL("https://auth.mercadopago.com/authorization");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("platform_id", "mp");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", statePayload);

  return NextResponse.redirect(authUrl);
}
