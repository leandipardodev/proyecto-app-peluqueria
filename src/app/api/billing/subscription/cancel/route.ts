import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { createServerClient } from "@/lib/supabase/server";

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
      return NextResponse.json({ error: "Solo el owner puede cancelar suscripción" }, { status: 403 });
    }

    const { data: sub } = await admin
      .from("shop_subscriptions")
      .select("id, preapproval_id, status")
      .eq("shop_id", shopId)
      .eq("status", "authorized")
      .maybeSingle();

    if (!sub) {
      return NextResponse.json({ error: "No hay suscripción automática activa" }, { status: 404 });
    }

    const client = new MercadoPagoConfig({ accessToken: token });
    const preapproval = new PreApproval(client);
    await preapproval.update({
      id: sub.preapproval_id,
      body: { status: "cancelled" },
    });

    await admin
      .from("shop_subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", sub.id);

    await admin.from("shop_billing_events").insert({
      shop_id: shopId,
      actor_user_id: user.id,
      event_type: "subscription_auto_cancelled",
      payload: { preapproval_id: sub.preapproval_id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[billing-subscription-cancel] error", msg, error);
    return NextResponse.json({ error: `Error al cancelar suscripción: ${msg}` }, { status: 500 });
  }
}
