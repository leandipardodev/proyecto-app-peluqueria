import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { createServerClient } from "@/lib/supabase/server";
import crypto from "crypto";

function stateSecret(): string {
  return (
    process.env.META_WA_STATE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function businessUrl(slug: string | null, status: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const path = slug ? `/dashboard/${slug}/business` : "/dashboard/business";
  const url = new URL(path, siteUrl);
  url.searchParams.set("wa", status);
  return url.toString();
}

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_WHATSAPP_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "error_off", redirect: businessUrl(null, "error_off") });
  }

  let body: {
    state?: string;
    token_code?: string;
    code?: string;
    waba_id?: string | null;
    phone_number_id?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "error_state", redirect: businessUrl(null, "error_state") });
  }

  const { state, token_code, waba_id, phone_number_id } = body;
  const code = body.code || token_code;

  if (!state || !code || !waba_id || !phone_number_id) {
    return NextResponse.json({ ok: false, error: "error_state", redirect: businessUrl(null, "error_state") });
  }

  const secret = stateSecret();
  if (!secret) return NextResponse.json({ ok: false, error: "error_env", redirect: businessUrl(null, "error_env") });

  let shopId = "";
  try {
    const [payload, sig] = state.split(".");
    if (!payload || !sig) return NextResponse.json({ ok: false, error: "error_state", redirect: businessUrl(null, "error_state") });

    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return NextResponse.json({ ok: false, error: "error_state", redirect: businessUrl(null, "error_state") });
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      shopId?: string;
      ts?: number;
    };
    if (!decoded.shopId || !decoded.ts || Math.abs(Date.now() - decoded.ts) > 1000 * 60 * 15) {
      return NextResponse.json({ ok: false, error: "error_state", redirect: businessUrl(null, "error_state") });
    }
    shopId = decoded.shopId;
  } catch {
    return NextResponse.json({ ok: false, error: "error_state", redirect: businessUrl(null, "error_state") });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "error_auth", redirect: businessUrl(null, "error_auth") });

  const admin = await createServiceRoleClient();
  const { data: membership } = await admin
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const canManage = membership?.is_active && (membership.role === "owner" || membership.role === "admin");
  if (!canManage) return NextResponse.json({ ok: false, error: "error_access", redirect: businessUrl(null, "error_access") });

  const { exchangeEmbeddedTokenCode, registerPhoneNumber, subscribeWhatsAppWebhook } = await import(
    "@/lib/dashboard/whatsapp/wa-graph"
  );
  const { saveWhatsAppToken } = await import("@/lib/dashboard/whatsapp/wa-vault");

  let token: string;
  try {
    const exchanged = await exchangeEmbeddedTokenCode(code);
    token = exchanged.access_token;
  } catch {
    return NextResponse.json({ ok: false, error: "error_token", redirect: businessUrl(null, "error_token") });
  }

  await saveWhatsAppToken(shopId, token);

  await registerPhoneNumber(phone_number_id, token).catch(() => undefined);
  await subscribeWhatsAppWebhook(token).catch(() => undefined);

  const { data: shop } = await admin.from("shops").select("slug").eq("id", shopId).maybeSingle();

  const { error: updateError } = await admin
    .from("shops")
    .update({
      wa_waba_id: waba_id,
      wa_phone_number_id: phone_number_id,
      wa_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: "error_save", redirect: businessUrl(shop?.slug || null, "error_save") });
  }

  return NextResponse.json({ ok: true, redirect: businessUrl(shop?.slug || null, "connected") });
}