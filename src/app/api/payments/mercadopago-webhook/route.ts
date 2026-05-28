import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { cycleMonths, type BillingCycle } from "@/lib/billing/plans";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import { sendAppointmentConfirmationEmail } from "@/lib/email/booking-emails";

async function createAdminClient() {
  return createServiceRoleClient();
}

function resolveStatusFromPaymentStatus(paymentStatus: string | undefined): "confirmed" | "pending_payment" | "cancelled" {
  if (paymentStatus === "approved") return "confirmed";
  if (paymentStatus === "pending" || paymentStatus === "in_process") return "pending_payment";
  return "cancelled";
}

function parseBillingExternalReference(externalReference: string): {
  shopId: string;
  cycle: BillingCycle;
} | null {
  const parts = externalReference.split(":");
  if (parts.length < 4) return null;
  if (parts[0] !== "shop_sub") return null;

  const shopId = parts[1];
  const cycleRaw = parts[2];

  if (!shopId) return null;
  if (cycleRaw !== "monthly") return null;

  return { shopId, cycle: cycleRaw };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === "23505";
}

function formatDateInArgentina(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
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
    if (scope === "billing" || externalReference.startsWith("shop_sub:")) {
      const parsed = parseBillingExternalReference(externalReference);
      if (!parsed) {
        return NextResponse.json({ ok: true });
      }

      const { shopId: extShopId, cycle } = parsed;
      const normalizedPaymentId = String(paymentId);

      await admin.from("shop_billing_events").insert({
        shop_id: extShopId,
        actor_user_id: null,
        event_type: "subscription_payment_webhook",
        payload: {
          payment_id: normalizedPaymentId,
          status: paymentResult.status,
          cycle,
          external_reference: externalReference,
        },
      });

      if (paymentResult.status !== "approved") {
        return NextResponse.json({ ok: true });
      }

      const { error: lockError } = await admin.from("shop_billing_events").insert({
        shop_id: extShopId,
        actor_user_id: null,
        event_type: "subscription_payment_applied",
        payload: {
          payment_id: normalizedPaymentId,
          status: paymentResult.status,
          cycle,
          external_reference: externalReference,
        },
      });

      if (lockError) {
        if (isUniqueViolation(lockError)) {
          return NextResponse.json({ ok: true });
        }
        throw lockError;
      }

      const { data: shop } = await admin
        .from("shops")
        .select("id, plan_expiry")
        .eq("id", extShopId)
        .maybeSingle();

      if (shop) {
        const now = new Date();
        const currentExpiry = shop.plan_expiry ? new Date(shop.plan_expiry) : null;
        const todayAr = formatDateInArgentina(now);
        const expiryAr = currentExpiry ? formatDateInArgentina(currentExpiry) : null;
        const hasPaidDaysRemaining = Boolean(currentExpiry && expiryAr && expiryAr > todayAr);
        const base = hasPaidDaysRemaining && currentExpiry ? currentExpiry : now;
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

        await trackProductEvent(extShopId, "subscription_paid", {
          metadata: { payment_id: normalizedPaymentId, cycle },
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Check if this is a pending_booking (new flow: appointment created after payment)
    const PENDING_BOOKING_PREFIX = "pending_booking:";
    if (externalReference.startsWith(PENDING_BOOKING_PREFIX)) {
      const bookingId = externalReference.slice(PENDING_BOOKING_PREFIX.length);
      if (!bookingId) {
        return NextResponse.json({ ok: true });
      }

      const { data: booking } = await admin
        .from("pending_bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();

      if (!booking || booking.status !== "pending") {
        return NextResponse.json({ ok: true });
      }

      const normalizedPaymentId = String(paymentId);

      if (paymentResult.status === "approved") {
        // Ensure idempotency
        const { error: lockError } = await admin.from("shop_billing_events").insert({
          shop_id: booking.shop_id,
          actor_user_id: null,
          event_type: "appointment_payment_applied",
          payload: {
            payment_id: normalizedPaymentId,
            pending_booking_id: booking.id,
            status: paymentResult.status,
          },
        });

        if (lockError) {
          if (isUniqueViolation(lockError)) {
            return NextResponse.json({ ok: true });
          }
          throw lockError;
        }

        // Create or update customer
        let customerId: string;
        const { data: existingCustomer } = await admin
          .from("customers")
          .select("id")
          .eq("shop_id", booking.shop_id)
          .eq("telefono", booking.customer_phone)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingCustomer) {
          customerId = existingCustomer.id;
          await admin
            .from("customers")
            .update({
              nombre: booking.customer_name,
              email: booking.customer_email || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", customerId);
        } else {
          const { data: newCustomer, error: custError } = await admin
            .from("customers")
            .insert({
              shop_id: booking.shop_id,
              nombre: booking.customer_name,
              telefono: booking.customer_phone,
              email: booking.customer_email || null,
            })
            .select("id")
            .single();

          if (custError) throw custError;
          customerId = newCustomer.id;
        }

        // Create appointment
        const { data: service } = await admin
          .from("services")
          .select("name")
          .eq("id", booking.service_id)
          .maybeSingle();

        const { data: shop } = await admin
          .from("shops")
          .select("nombre, email")
          .eq("id", booking.shop_id)
          .maybeSingle();

        const { data: createdAppointment, error: aptError } = await admin
          .from("appointments")
          .insert({
            shop_id: booking.shop_id,
            customer_id: customerId,
            staff_id: booking.staff_id || null,
            service_id: booking.service_id,
            start_time: booking.start_time,
            end_time: booking.end_time,
            date_key_ar: getArgentinaDateKey(booking.start_time),
            status: "scheduled",
            is_paid: true,
            deposit_amount: booking.deposit_amount,
            mp_preference_id: booking.mp_preference_id,
          })
          .select("id")
          .single();

        if (aptError) throw aptError;

        // Mark pending_booking as completed
        await admin
          .from("pending_bookings")
          .update({ status: "completed" })
          .eq("id", booking.id);

        // Send confirmation email
        if (booking.customer_email) {
          const shopData = shop as { nombre?: string | null; email?: string | null } | null;
          const serviceName = (service as { name?: string | null } | null)?.name || "Servicio";
          const replyTo = shopData?.email && shopData.email.includes("@") ? shopData.email : undefined;

          sendAppointmentConfirmationEmail({
            to: booking.customer_email,
            customerName: booking.customer_name,
            shopName: shopData?.nombre || "Klip",
            serviceName,
            startTime: booking.start_time,
            replyTo,
          }).catch((err) => console.error("[webhook] confirmation email error:", err));
        }

        return NextResponse.json({ ok: true });
      } else {
        // Payment not approved — mark booking as expired/cancelled
        const cancelStatus = paymentResult.status === "cancelled" ? "cancelled" : "expired";
        await admin
          .from("pending_bookings")
          .update({ status: cancelStatus })
          .eq("id", booking.id);

        return NextResponse.json({ ok: true });
      }
    }

    const appointmentId =
      (paymentResult.metadata?.appointment_id as string | undefined) ||
      (paymentResult.external_reference as string | undefined);

    if (!appointmentId) {
      return NextResponse.json({ ok: true });
    }

    const status = resolveStatusFromPaymentStatus(paymentResult.status);
    const normalizedPaymentId = String(paymentId);

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

    if (paymentResult.status === "approved") {
      const { error: lockError } = await admin.from("shop_billing_events").insert({
        shop_id: appointment.shop_id,
        actor_user_id: null,
        event_type: "appointment_payment_applied",
        payload: {
          payment_id: normalizedPaymentId,
          appointment_id: appointment.id,
          status: paymentResult.status,
          external_reference: paymentResult.external_reference,
        },
      });

      if (lockError) {
        if (isUniqueViolation(lockError)) {
          return NextResponse.json({ ok: true });
        }
        throw lockError;
      }
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
        payment_id: normalizedPaymentId,
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
