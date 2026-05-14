import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { cycleMonths, type BillingCycle } from "@/lib/billing/plans";

async function createAdminClient() {
  return createServiceRoleClient();
}

function resolveStatusFromPaymentStatus(paymentStatus: string | undefined): "confirmed" | "pending_payment" | "cancelled" {
  if (paymentStatus === "approved") return "confirmed";
  if (paymentStatus === "pending" || paymentStatus === "in_process") return "pending_payment";
  return "cancelled";
}

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient();
    const shopId = request.nextUrl.searchParams.get("shop_id");
    const scope = request.nextUrl.searchParams.get("scope");
    let accessToken = process.env.MP_ACCESS_TOKEN || "";

    if (shopId && scope !== "billing") {
      const { data: shop } = await admin
        .from("shops")
        .select("id, mp_access_token")
        .eq("id", shopId)
        .single();

      if (!shop?.mp_access_token) {
        return NextResponse.json({ ok: false, error: "Shop Mercado Pago token missing" }, { status: 400 });
      }

      accessToken = shop.mp_access_token as string;
    }

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Mercado Pago token missing" }, { status: 500 });
    }

    const payload = await request.json().catch(() => null);
    const queryType = request.nextUrl.searchParams.get("type") || request.nextUrl.searchParams.get("topic");
    const queryDataId = request.nextUrl.searchParams.get("data.id") || request.nextUrl.searchParams.get("id");
    const type = payload?.type || queryType;
    const paymentId = payload?.data?.id || queryDataId;

    if (type !== "payment" || !paymentId) {
      return NextResponse.json({ ok: true });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    const paymentResult = await payment.get({ id: paymentId });

    const externalReference = (paymentResult.external_reference as string | undefined) || "";
    if (externalReference.startsWith("shop_sub:")) {
      const [, extShopId, cycleRaw] = externalReference.split(":");
      const cycle = cycleRaw as BillingCycle;
      if (extShopId && (cycle === "monthly" || cycle === "semiannual" || cycle === "annual")) {
        const { data: shop } = await admin
          .from("shops")
          .select("id, plan_expiry")
          .eq("id", extShopId)
          .maybeSingle();

        if (shop && paymentResult.status === "approved") {
          const now = new Date();
          const currentExpiry = shop.plan_expiry ? new Date(shop.plan_expiry) : null;
          const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
          const nextExpiry = new Date(base);
          nextExpiry.setMonth(nextExpiry.getMonth() + cycleMonths(cycle));

          await admin
            .from("shops")
            .update({
              active: true,
              plan_expiry: nextExpiry.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", extShopId);
        }

        await admin.from("shop_billing_events").insert({
          shop_id: extShopId,
          actor_user_id: null,
          event_type: "subscription_payment_webhook",
          payload: {
            payment_id: paymentId,
            status: paymentResult.status,
            cycle,
            external_reference: externalReference,
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    const appointmentId =
      (paymentResult.metadata?.appointment_id as string | undefined) ||
      (paymentResult.external_reference as string | undefined);

    if (!appointmentId) {
      return NextResponse.json({ ok: true });
    }

    const status = resolveStatusFromPaymentStatus(paymentResult.status);

    let appointmentQuery = admin
      .from("appointments")
      .select("id, shop_id")
      .eq("id", appointmentId);

    if (shopId) {
      appointmentQuery = appointmentQuery.eq("shop_id", shopId);
    }

    const { data: appointment } = await appointmentQuery.maybeSingle();

    if (!appointment) {
      return NextResponse.json({ ok: true });
    }

    const preferenceId = (paymentResult.order?.id as string | undefined) || (paymentResult.metadata?.preference_id as string | undefined) || undefined;

    await admin
      .from("appointments")
      .update({
        status,
        is_paid: paymentResult.status === "approved",
        mp_preference_id: preferenceId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id)
      .eq("shop_id", appointment.shop_id);

    await admin.from("mercadopago_logs").insert({
      shop_id: appointment.shop_id,
      appointment_id: appointment.id,
      mp_preference_id: preferenceId,
      event_type: "payment_webhook",
      payload: {
        payment_id: paymentId,
        status: paymentResult.status,
        external_reference: paymentResult.external_reference,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mercadopago-webhook] error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
