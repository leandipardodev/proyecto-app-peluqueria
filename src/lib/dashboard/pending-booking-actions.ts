"use server";

import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import {
  getArgentinaDateKey,
  getArgentinaDateString,
  getArgentinaMinutesSinceMidnight,
} from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import { createRateLimiter } from "@/lib/rate-limiter";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { headers } from "next/headers";
import { fetchShopDateOverrides } from "@/lib/dashboard/business-actions";
import "server-only";

const createBookingLimiter = createRateLimiter({ intervalMs: 60_000, maxRequests: 10 });

type PendingBookingInput = {
  recaptchaToken?: string;
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
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || "unknown";
    const rateCheck = await createBookingLimiter.check(`create-pending-booking:${ip}`);
    if (!rateCheck.allowed) {
      return { success: false, error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." };
    }

    if (input.recaptchaToken) {
      const recaptchaResult = await verifyRecaptcha(input.recaptchaToken);
      if (!recaptchaResult.success) {
        return { success: false, error: "Verificacion de seguridad fallida. Intenta de nuevo." };
      }
    }

    const admin = await createServiceRoleClient();

    // Validate email
    if (input.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
      return { success: false, error: "Email inválido" };
    }

    // Validate times
    const startDate = new Date(input.startTime);
    const endDate = new Date(input.endTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return { success: false, error: "Horario invalido" };
    }

    // Validate hours
    const bookingDate = getArgentinaDateKey(input.startTime);
    const todayAr = getArgentinaDateString();
    if (bookingDate < todayAr) {
      return { success: false, error: "No se puede reservar en una fecha pasada" };
    }
    if (bookingDate === todayAr) {
      const nowMinutes = getArgentinaMinutesSinceMidnight(new Date());
      const bookingMinutes = getArgentinaMinutesSinceMidnight(input.startTime);
      if (bookingMinutes < nowMinutes) {
        return { success: false, error: "No se puede reservar en un horario pasado" };
      }
    }

    const startMinutes = getArgentinaMinutesSinceMidnight(input.startTime);
    const endMinutes = getArgentinaMinutesSinceMidnight(input.endTime);
    const dayIndex = new Date(`${bookingDate}T12:00:00-03:00`).getDay();

    // Validate against shop hours
    const { data: shopHoursData } = await admin
      .from("shops")
      .select("business_hours")
      .eq("id", input.shopId)
      .maybeSingle();

    let shopHoursRaw: Record<string, unknown> | null = null;
    if (typeof shopHoursData?.business_hours === "string") {
      try { shopHoursRaw = JSON.parse(shopHoursData.business_hours); } catch { shopHoursRaw = null; }
    } else if (shopHoursData?.business_hours && typeof shopHoursData.business_hours === "object") {
      shopHoursRaw = shopHoursData.business_hours as Record<string, unknown>;
    }

    const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][dayIndex];
    const rawDay = shopHoursRaw?.[dayKey] as Record<string, unknown> | undefined;
    const shopOpen = rawDay?.open === true;
    const shopStartRaw = typeof rawDay?.start === "string" ? rawDay.start : "09:00";
    const shopEndRaw = typeof rawDay?.end === "string" ? rawDay.end : "20:00";
    const [shopSh, shopSm] = shopStartRaw.split(":").map(Number);
    const [shopEh, shopEm] = shopEndRaw.split(":").map(Number);
    const shopOpenMinutes = shopSh * 60 + shopSm;
    const shopCloseMinutes = shopEh * 60 + shopEm;
    const shopBreakStart = rawDay?.break_start ? String(rawDay.break_start) : null;
    const shopBreakEnd = rawDay?.break_end ? String(rawDay.break_end) : null;

    if (!shopOpen) {
      return { success: false, error: "El local esta cerrado en ese horario" };
    }
    if (shopOpenMinutes >= shopCloseMinutes || startMinutes < shopOpenMinutes || endMinutes > shopCloseMinutes) {
      return { success: false, error: "El horario seleccionado esta fuera del horario de atencion" };
    }
    if (shopBreakStart && shopBreakEnd) {
      const [bsh, bsm] = shopBreakStart.split(":").map(Number);
      const [beh, bem] = shopBreakEnd.split(":").map(Number);
      const breakStart = bsh * 60 + bsm;
      const breakEnd = beh * 60 + bem;
      if (startMinutes < breakEnd && endMinutes > breakStart) {
        return { success: false, error: "El horario seleccionado coincide con el descanso" };
      }
    }

    // Check date overrides (defense in depth)
    const pbOverrideResult = await fetchShopDateOverrides(input.shopId, bookingDate, bookingDate);
    if (pbOverrideResult.success && pbOverrideResult.data) {
      const pbShopOverride = pbOverrideResult.data.find(o => o.staff_id === null);
      if (pbShopOverride) {
        if (pbShopOverride.is_closed) {
          return { success: false, error: "El local esta cerrado este dia" };
        }
        if (pbShopOverride.start_time && pbShopOverride.end_time) {
          const [ovSh, ovSm] = pbShopOverride.start_time.split(":").map(Number);
          const [ovEh, ovEm] = pbShopOverride.end_time.split(":").map(Number);
          const ovOpen = ovSh * 60 + ovSm;
          const ovClose = ovEh * 60 + ovEm;
          if (startMinutes < ovOpen || endMinutes > ovClose) {
            return { success: false, error: "El horario seleccionado esta fuera del horario de atencion" };
          }
        }
      }
      if (input.staffId) {
        const pbStaffOverride = pbOverrideResult.data.find(o => o.staff_id === input.staffId);
        if (pbStaffOverride) {
          if (pbStaffOverride.is_closed) {
            return { success: false, error: "El profesional no trabaja este dia" };
          }
          if (pbStaffOverride.start_time && pbStaffOverride.end_time) {
            const [ovSh, ovSm] = pbStaffOverride.start_time.split(":").map(Number);
            const [ovEh, ovEm] = pbStaffOverride.end_time.split(":").map(Number);
            const ovOpen = ovSh * 60 + ovSm;
            const ovClose = ovEh * 60 + ovEm;
            if (startMinutes < ovOpen || endMinutes > ovClose) {
              return { success: false, error: "El horario seleccionado esta fuera del horario de atencion" };
            }
          }
        }
      }
    }

    // Check for conflicts with existing appointments (including old pending_payment within hold window)
    // and other pending bookings
    let aptConflictQuery = admin
      .from("appointments")
      .select("id, status, created_at")
      .eq("shop_id", input.shopId)
      .lt("start_time", input.endTime)
      .gt("end_time", input.startTime)
      .not("status", "eq", "cancelled");

    if (input.staffId) {
      aptConflictQuery = aptConflictQuery.eq("staff_id", input.staffId);
    }

    let pendingConflictQuery = admin
      .from("pending_bookings")
      .select("id")
      .eq("shop_id", input.shopId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .lt("start_time", input.endTime)
      .gt("end_time", input.startTime);

    if (input.staffId) {
      pendingConflictQuery = pendingConflictQuery.eq("staff_id", input.staffId);
    }

    const [existingAppointments, existingPendingBookings] = await Promise.all([
      aptConflictQuery,
      pendingConflictQuery,
    ]);

    const hasConflict = (existingAppointments.data || []).some((apt) => {
      if (apt.status === "pending_payment") {
        if (!apt.created_at) return false;
        const holdMs = 10 * 60 * 1000;
        return Date.now() - new Date(apt.created_at).getTime() <= holdMs;
      }
      return true;
    });

    if (hasConflict || (existingPendingBookings.data && existingPendingBookings.data.length > 0)) {
      return { success: false, error: "slot_taken" };
    }

    // Insert pending booking (atomic with unique constraint as safety net against race condition)
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

    if (insertError) {
      if (insertError.code === "23505") {
        return { success: false, error: "slot_taken" };
      }
      return { success: false, error: insertError.message || "Error al crear reserva pendiente" };
    }

    if (!booking) {
      return { success: false, error: "Error al crear reserva pendiente" };
    }

    // Create MP preference with booking ID as external_reference
    const accessToken = process.env.MP_ACCESS_TOKEN || "";
    if (!accessToken) {
      // Cleanup
      await admin.from("pending_bookings").delete().eq("id", booking.id);
      return { success: false, error: "Mercado Pago no esta configurado" };
    }

    const { data: shopPolicy } = await admin
      .from("shops")
      .select("booking_deposit_enabled, booking_deposit_amount")
      .eq("id", input.shopId)
      .maybeSingle();

    const depositEnabled = shopPolicy?.booking_deposit_enabled !== false;
    const configuredDeposit = Math.max(0, Number(shopPolicy?.booking_deposit_amount ?? 0));
    const chargeAmount = depositEnabled
      ? Math.max(1, Math.min(input.servicePrice, configuredDeposit > 0 ? configuredDeposit : input.servicePrice))
      : Math.max(1, input.servicePrice);

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
