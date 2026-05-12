import { NextRequest, NextResponse } from "next/server";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { MercadoPagoConfig, Payment } from "mercadopago";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  );
}

function resolveStatusFromPaymentStatus(paymentStatus: string | undefined): "confirmed" | "pending_payment" | "cancelled" {
  if (paymentStatus === "approved") return "confirmed";
  if (paymentStatus === "pending" || paymentStatus === "in_process") return "pending_payment";
  return "cancelled";
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "MP_ACCESS_TOKEN missing" }, { status: 500 });
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

    const appointmentId =
      (paymentResult.metadata?.appointment_id as string | undefined) ||
      (paymentResult.external_reference as string | undefined);

    if (!appointmentId) {
      return NextResponse.json({ ok: true });
    }

    const status = resolveStatusFromPaymentStatus(paymentResult.status);
    const admin = createAdminClient();

    await admin
      .from("appointments")
      .update({
        status,
        is_paid: paymentResult.status === "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mercadopago-webhook] error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
