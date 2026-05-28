"use server";

import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import {
  getArgentinaDateKey,
  getArgentinaMinutesSinceMidnight,
} from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import "server-only";

type PendingBookingInput = {
  shopId: string;
  shopSlug: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  staffId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  authenticatedUserId?: string;
  startTime: string;
  endTime: string;
};

type CreatePendingBookingOutput = {
  bookingId: string;
  initPoint: string;
  preferenceId: string;
  chargedAmount: number;
  isDeposit: boolean;
};

export async function createPendingBooking(
  input: PendingBookingInput
): Promise<ActionResult<CreatePendingBookingOutput>> {
  try {
    const admin = await createServiceRoleClient();

    // Validate times
    const startDate = new Date(input.startTime);
    const endDate = new Date(input.endTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return { success: false, error: "Horario invalido" };
    }

    // Validate hours
    const bookingDate = getArgentinaDateKey(input.startTime);
    const startMinutes = getArgentinaMinutesSinceMidnight(input.startTime);
    const endMinutes = getArgentinaMinutesSinceMidnight(input.endTime);

    // Check for conflicts with existing appointments (including old pending_payment within hold window)
    // and other pending bookings
    const [existingAppointments, existingPendingBookings] = await Promise.all([
      admin
        .from("appointments")
        .select("id, status, created_at")
        .eq("shop_id", input.shopId)
        .lt("start_time", input.endTime)
        .gt("end_time", input.startTime)
        .not("status", "eq", "cancelled"),
      admin
        .from("pending_bookings")
        .select("id")
        .eq("shop_id", input.shopId)
        .eq("status", "pending")
        .lt("start_time", input.endTime)
        .gt("end_time", input.startTime),
    ]);

    const hasConflict = (existingAppointments.data || []).some((apt) => {
      if (apt.status === "pending_payment") {
        if (!apt.created_at) return false;
        const holdMs = 15 * 60 * 1000;
        return Date.now() - new Date(apt.created_at).getTime() <= holdMs;
      }
      return true;
    });

    if (hasConflict || (existingPendingBookings.data && existingPendingBookings.data.length > 0)) {
      return { success: false, error: "slot_taken" };
    }

    // Insert pending booking
    const { data: booking, error: insertError } = await admin
      .from("pending_bookings")
      .insert({
        shop_id: input.shopId,
        service_id: input.serviceId,
        staff_id: input.staffId || null,
        customer_name: input.customerName,
        customer_email: input.customerEmail || null,
        customer_phone: input.customerPhone,
        authenticated_user_id: input.authenticatedUserId || null,
        start_time: input.startTime,
        end_time: input.endTime,
        status: "pending",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !booking) {
      return { success: false, error: insertError?.message || "Error al crear reserva pendiente" };
    }

    // Create MP preference with booking ID as external_reference
    const accessToken = process.env.MP_ACCESS_TOKEN || "";
    if (!accessToken) {
      // Cleanup
      await admin.from("pending_bookings").delete().eq("id", booking.id);
      return { success: false, error: "Mercado Pago no esta configurado" };
    }

    const depositEnabled = true; // public booking always goes through MP
    const chargeAmount = Math.max(1, input.servicePrice);

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar").replace(/\/+$/, "");
    const successUrl = `${baseUrl}/confirmacion?status=success&slug=${encodeURIComponent(input.shopSlug)}`;
    const pendingUrl = `${baseUrl}/confirmacion?status=pending&slug=${encodeURIComponent(input.shopSlug)}`;
    const failureUrl = `${baseUrl}/confirmacion?status=failure&slug=${encodeURIComponent(input.shopSlug)}`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook`;
    const canUseBackUrls = /^https?:\/\//.test(baseUrl) && !/localhost|127\.0\.0\.1/.test(baseUrl);
    const shouldSendWebhook = notificationUrl.startsWith("https://");

    const client = new MercadoPagoConfig({ accessToken });
    const preferenceApi = new Preference(client);

    const preferenceResult = await preferenceApi.create({
      body: {
        items: [
          {
            id: booking.id,
            title: input.serviceName,
            quantity: 1,
            unit_price: chargeAmount,
            currency_id: "ARS",
          },
        ],
        back_urls: canUseBackUrls
          ? { success: successUrl, pending: pendingUrl, failure: failureUrl }
          : undefined,
        auto_return: canUseBackUrls ? "approved" : undefined,
        external_reference: `pending_booking:${booking.id}`,
        notification_url: shouldSendWebhook ? notificationUrl : undefined,
        metadata: {
          pending_booking_id: booking.id,
          shop_id: input.shopId,
        },
      },
    });

    if (!preferenceResult.id || !preferenceResult.init_point) {
      await admin.from("pending_bookings").delete().eq("id", booking.id);
      return { success: false, error: "No se pudo crear la preferencia de pago" };
    }

    // Save preference ID on booking
    await admin
      .from("pending_bookings")
      .update({ mp_preference_id: preferenceResult.id })
      .eq("id", booking.id);

    return {
      success: true,
      data: {
        bookingId: booking.id,
        initPoint: preferenceResult.init_point,
        preferenceId: preferenceResult.id,
        chargedAmount: chargeAmount,
        isDeposit: depositEnabled,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear reserva pendiente" };
  }
}

export async function deletePendingBooking(
  bookingId: string,
  shopId: string
): Promise<ActionResult> {
  try {
    const admin = await createServiceRoleClient();
    const { error } = await admin
      .from("pending_bookings")
      .delete()
      .eq("id", bookingId)
      .eq("shop_id", shopId)
      .eq("status", "pending");

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cancelar reserva" };
  }
}
