import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { createServerClient } from "@/lib/supabase/server";
import { BILLING_PRICES } from "@/lib/billing/plans";

export async function POST(request: NextRequest) {
  try {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "MP_ACCESS_TOKEN no configurado" }, { status: 500 });
    }

    const body = await request.json();
    const shopId = String(body?.shopId || "").trim();
    if (!shopId) {
      return NextResponse.json({ error: "shopId requerido" }, { status: 400 });
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
      return NextResponse.json({ error: "Solo el owner puede activar suscripción automática" }, { status: 403 });
    }

    const { data: existingSub } = await admin
      .from("shop_subscriptions")
      .select("id, status")
      .eq("shop_id", shopId)
      .in("status", ["authorized"])
      .maybeSingle();

    if (existingSub) {
      return NextResponse.json({ error: "Ya tenés una suscripción automática activa" }, { status: 409 });
    }

    const { data: shop } = await admin
      .from("shops")
      .select("id, nombre, slug")
      .eq("id", shopId)
      .maybeSingle();

    if (!shop) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const baseUrl = origin.replace(/\/+$/, "");
    const successUrl = `${baseUrl}/dashboard/${shop.slug}/billing?subscription=success`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook`;
    const externalReference = `shop_sub_auto:${shopId}`;

    const client = new MercadoPagoConfig({ accessToken: token });
    const preapproval = new PreApproval(client);
    const created = await preapproval.create({
      body: {
        reason: `${shop.nombre} - Membresía Mensual Automática`,
        external_reference: externalReference,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: BILLING_PRICES.monthly,
          currency_id: "ARS",
        },
        back_url: successUrl,
        notification_url: notificationUrl,
      } as any,
    });

    await admin.from("shop_billing_events").insert({
      shop_id: shopId,
      actor_user_id: user.id,
      event_type: "subscription_auto_checkout_created",
      payload: {
        mp_preapproval_id: created.id || null,
        external_reference: externalReference,
      },
    });

    return NextResponse.json({
      init_point: created.init_point || "",
      preapproval_id: created.id || "",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[billing-subscription-activate] error", msg, error);
    return NextResponse.json({ error: `Error al activar suscripción: ${msg}` }, { status: 500 });
  }
}
