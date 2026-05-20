import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { BILLING_LABELS, BILLING_PRICES, BillingCycle } from "@/lib/billing/plans";

function isBillingCycle(value: string): value is BillingCycle {
  return value === "monthly";
}

export async function POST(request: NextRequest) {
  try {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return NextResponse.json({ error: "MP_ACCESS_TOKEN no configurado" }, { status: 500 });

    const body = await request.json();
    const cycleRaw = String(body?.cycle || "monthly");
    const shopId = String(body?.shopId || "").trim();

    if (!shopId || !isBillingCycle(cycleRaw)) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });

    const admin = await createServiceRoleClient();
    const { data: membership } = await admin
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", user.id)
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .eq("role", "owner")
      .maybeSingle();

    if (!membership?.shop_id) {
      return NextResponse.json({ error: "Solo owner puede pagar membresía" }, { status: 403 });
    }

    const { data: shop } = await admin.from("shops").select("id, nombre, slug").eq("id", shopId).single();
    if (!shop) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

    const amount = BILLING_PRICES[cycleRaw];
    const label = BILLING_LABELS[cycleRaw];

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const baseUrl = origin.replace(/\/+$/, "");
    const dashboardPath = shop.slug ? `/dashboard/${shop.slug}` : "/dashboard";
    const backUrl = `${baseUrl}${dashboardPath}?billing=return&shop_id=${encodeURIComponent(shopId)}`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook?shop_id=${encodeURIComponent(shopId)}&scope=billing`;
    const externalReference = `shop_sub:${shopId}:${cycleRaw}:${Date.now()}`;

    const client = new MercadoPagoConfig({ accessToken: token });
    const preference = new Preference(client);
    const created = await preference.create({
      body: {
        items: [
          {
            id: `sub-${cycleRaw}`,
            title: `${shop.nombre} - Membresía ${label}`,
            quantity: 1,
            unit_price: amount,
            currency_id: "ARS",
          },
        ],
        back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
        auto_return: "approved",
        external_reference: externalReference,
        notification_url: notificationUrl,
      },
    });

    await admin.from("shop_billing_events").insert({
      shop_id: shopId,
      actor_user_id: user.id,
      event_type: "subscription_checkout_created",
      payload: { cycle: cycleRaw, amount, external_reference: externalReference, mp_preference_id: created.id || null },
    });

    return NextResponse.json({ init_point: created.init_point || "", preference_id: created.id || "" });
  } catch (error) {
    console.error("[billing-checkout] error", error);
    return NextResponse.json({ error: "Error al crear checkout de membresía" }, { status: 500 });
  }
}
