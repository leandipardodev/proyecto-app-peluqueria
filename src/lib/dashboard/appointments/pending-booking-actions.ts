"use server";

import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { buildMpPaymentMethods, fetchShopMpPaymentConfig } from "@/lib/payments/mp-payment-config";
import {
  getArgentinaDateKey,
  getArgentinaDateString,
  getArgentinaMinutesSinceMidnight,
} from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import { createRateLimiter } from "@/lib/rate-limiter";
import { headers } from "next/headers";
import { fetchPublicShopDateOverrides } from "@/lib/dashboard/booking/public-booking-actions";
import { sendAppointmentConfirmationEmail } from "@/lib/email/booking-emails";
import { completedBookingCache } from "@/lib/booking-cache";
import "server-only";

const createBookingLimiter = createRateLimiter({ intervalMs: 60_000, maxRequests: 10 });

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
  paymentMethod?: "mp" | "bank_transfer";
};

type CreatePendingBookingOutput = {
  bookingId: string;
  initPoint: string;
  preferenceId: string;
  chargedAmount: number;
  isDeposit: boolean;
  paymentMethod: "mp" | "bank_transfer";
  bankDetails?: {
    cvuCb: string;
    alias: string;
    bankName: string;
  };
  whatsappMessage?: string;
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

    const ipKey = `completed-booking:${ip}:${input.shopId}`;
    if (completedBookingCache.has(ipKey) && !input.authenticatedUserId) {
      return { success: false, error: "login_required" };
    }

    const admin = await createServiceRoleClient();

    // Validate email
    if (input.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
      return { success: false, error: "Email inválido" };
    }
    const cleanPhone = input.customerPhone.replace(/\D/g, "");
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return { success: false, error: "Teléfono inválido" };
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
    const pbOverrideResult = await fetchPublicShopDateOverrides(input.shopId, bookingDate, bookingDate);
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
        if (pbShopOverride.break_start && pbShopOverride.break_end) {
          const [bsh, bsm] = pbShopOverride.break_start.split(":").map(Number);
          const [beh, bem] = pbShopOverride.break_end.split(":").map(Number);
          const breakStart = bsh * 60 + bsm;
          const breakEnd = beh * 60 + bem;
          if (startMinutes < breakEnd && endMinutes > breakStart) {
            return { success: false, error: "El horario seleccionado coincide con el descanso" };
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
          if (pbStaffOverride.break_start && pbStaffOverride.break_end) {
            const [bsh, bsm] = pbStaffOverride.break_start.split(":").map(Number);
            const [beh, bem] = pbStaffOverride.break_end.split(":").map(Number);
            const breakStart = bsh * 60 + bsm;
            const breakEnd = beh * 60 + bem;
            if (startMinutes < breakEnd && endMinutes > breakStart) {
              return { success: false, error: "El horario seleccionado coincide con el descanso" };
            }
          }
        }
      }
    }

    // Clean up expired pending bookings
    admin.from("pending_bookings").delete().lt("expires_at", new Date().toISOString()).then(() => {}, () => {});

    // Check for conflicts with existing appointments (including old pending_payment within hold window)
    // and other pending bookings
    let aptConflictQuery = admin
      .from("appointments")
      .select("id, status, created_at")
      .eq("shop_id", input.shopId)
      .lt("start_time", input.endTime)
      .gt("end_time", input.startTime)
      .neq("status", "cancelled")
      .neq("status", "no_show");

    if (input.staffId) {
      aptConflictQuery = aptConflictQuery.eq("staff_id", input.staffId);
    }

    let pendingConflictQuery = admin
      .from("pending_bookings")
      .select("id, ip_address")
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
      return apt.status !== "no_show";
    });

    const pendingRows = existingPendingBookings.data || [];
    // Let the same client re-take its own slot: a pending booking from the same IP
    // (e.g. an abandoned or stale checkout) is released instead of blocking.
    const ownPendingIds = pendingRows
      .filter((pb) => pb.ip_address && pb.ip_address === ip)
      .map((pb) => pb.id);
    const hasOtherPending = pendingRows.some((pb) => !pb.ip_address || pb.ip_address !== ip);

    if (hasConflict || hasOtherPending) {
      return { success: false, error: "slot_taken" };
    }

    if (ownPendingIds.length > 0) {
      await admin.from("pending_bookings").delete().in("id", ownPendingIds);
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

    const isBankTransfer = input.paymentMethod === "bank_transfer";

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
        ip_address: ip,
        start_time: input.startTime,
        end_time: input.endTime,
        status: "pending",
        payment_method: isBankTransfer ? "bank_transfer" : "mp",
        payment_amount: chargeAmount,
        expires_at: new Date(Date.now() + (isBankTransfer ? 12 * 60 * 60 * 1000 : 15 * 60 * 1000)).toISOString(),
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

    // Bank transfer: return bank details + WhatsApp message, skip MP preference
    if (isBankTransfer) {
      const { data: shopBank } = await admin
        .from("shops")
        .select("bank_cvu_cbu, bank_alias, bank_name")
        .eq("id", input.shopId)
        .maybeSingle();

      const bankDetails = {
        cvuCb: shopBank?.bank_cvu_cbu || "",
        alias: shopBank?.bank_alias || "",
        bankName: shopBank?.bank_name || "",
      };

      const whatsappMessage = buildBankTransferWhatsAppMessage({
        customerName: input.customerName,
        serviceName: input.serviceName,
        startTime: input.startTime,
        chargedAmount: chargeAmount,
        bankDetails,
      });

      return {
        success: true,
        data: {
          bookingId: booking.id,
          initPoint: "",
          preferenceId: "",
          chargedAmount: chargeAmount,
          isDeposit: depositEnabled,
          paymentMethod: "bank_transfer",
          bankDetails,
          whatsappMessage,
        },
      };
    }

    // MP flow: create preference
    const accessToken = process.env.MP_ACCESS_TOKEN || "";
    if (!accessToken) {
      await admin.from("pending_bookings").delete().eq("id", booking.id);
      return { success: false, error: "Mercado Pago no esta configurado" };
    }

    const paymentMethods = buildMpPaymentMethods(
      await fetchShopMpPaymentConfig(admin, input.shopId)
    );

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
        ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
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
        paymentMethod: "mp",
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

function buildBankTransferWhatsAppMessage(params: {
  customerName: string;
  serviceName: string;
  startTime: string;
  chargedAmount: number;
  bankDetails: { cvuCb: string; alias: string; bankName: string };
}): string {
  const date = new Date(params.startTime);
  const day = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

  const lines = [
    `Hola! Quiero confirmar mi pago por transferencia.`,
    ``,
    `Servicio: ${params.serviceName}`,
    `Fecha: ${day} a las ${time}`,
    `Monto: $${params.chargedAmount.toLocaleString("es-AR")}`,
    `Nombre: ${params.customerName}`,
  ];

  if (params.bankDetails.alias) {
    lines.push(`Alias: ${params.bankDetails.alias}`);
  }
  if (params.bankDetails.cvuCb) {
    lines.push(`CVU/CBU: ${params.bankDetails.cvuCb}`);
  }
  if (params.bankDetails.bankName) {
    lines.push(`Banco: ${params.bankDetails.bankName}`);
  }

  return lines.join("\n");
}

export type PendingBankTransfer = {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  startTime: string;
  endTime: string;
  paymentAmount: number;
  expiresAt: string;
  createdAt: string;
};

export async function getPendingBankTransfers(shopId: string): Promise<ActionResult<PendingBankTransfer[]>> {
  try {
    const admin = await createServiceRoleClient();
    const { data, error } = await admin
      .from("pending_bookings")
      .select("id, customer_name, customer_phone, service_id, start_time, end_time, payment_amount, expires_at, created_at")
      .eq("shop_id", shopId)
      .eq("status", "pending")
      .eq("payment_method", "bank_transfer")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const serviceIds = [...new Set((data || []).map((b) => b.service_id).filter(Boolean))];
    const serviceMap = new Map<string, string>();
    if (serviceIds.length > 0) {
      const { data: services } = await admin
        .from("services")
        .select("id, name")
        .in("id", serviceIds);
      (services || []).forEach((s) => serviceMap.set(s.id, s.name));
    }

    const transfers: PendingBankTransfer[] = (data || []).map((b) => ({
      id: b.id,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      serviceName: serviceMap.get(b.service_id) || "Servicio",
      startTime: b.start_time,
      endTime: b.end_time,
      paymentAmount: Number(b.payment_amount || 0),
      expiresAt: b.expires_at,
      createdAt: b.created_at,
    }));

    return { success: true, data: transfers };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al buscar transferencias" };
  }
}

export async function confirmBankTransferBooking(
  bookingId: string,
  shopId: string
): Promise<ActionResult> {
  try {
    const admin = await createServiceRoleClient();

    // Fetch the pending booking
    const { data: booking } = await admin
      .from("pending_bookings")
        .select("id, shop_id, status, customer_phone, customer_email, customer_name, service_id, start_time, end_time, staff_id, deposit_amount, payment_amount, expires_at, ip_address")
        .eq("id", bookingId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (!booking || booking.status !== "pending") {
      return { success: false, error: "La reserva ya no esta pendiente" };
    }

    // Check expiry
    if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
      await admin.from("pending_bookings").update({ status: "expired" }).eq("id", booking.id);
      return { success: false, error: "La reserva expiro" };
    }

    // Atomically claim
    const { data: claimed } = await admin
      .from("pending_bookings")
      .update({ status: "completed" })
      .eq("id", booking.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return { success: false, error: "La reserva ya fue procesada" };
    }

    // Audit trail
    await admin.from("shop_billing_events").insert({
      shop_id: booking.shop_id,
      actor_user_id: null,
      event_type: "appointment_payment_applied",
      payload: {
        payment_id: `bank_transfer_${booking.id}`,
        pending_booking_id: booking.id,
        status: "approved",
        payment_method: "bank_transfer",
      },
    });

    // Upsert customer
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

    // Re-check slot availability
    let conflictQuery = admin
      .from("appointments")
      .select("id")
      .eq("shop_id", booking.shop_id)
      .not("status", "eq", "cancelled")
      .lt("start_time", booking.end_time)
      .gt("end_time", booking.start_time);

    if (booking.staff_id) {
      conflictQuery = conflictQuery.eq("staff_id", booking.staff_id);
    }

    const { data: conflict } = await conflictQuery.limit(1);
    if (conflict && conflict.length > 0) {
      await admin.from("pending_bookings").update({ status: "expired" }).eq("id", booking.id);
      return { success: false, error: "El turno ya no esta disponible" };
    }

    // Fetch service price
    const { data: service } = await admin
      .from("services")
      .select("name, price")
      .eq("id", booking.service_id)
      .maybeSingle();

    // Create appointment
    const { error: aptError } = await admin
      .from("appointments")
      .insert({
        shop_id: booking.shop_id,
        customer_id: customerId,
        staff_id: booking.staff_id || null,
        service_id: booking.service_id,
        service_price: service?.price ?? null,
        start_time: booking.start_time,
        end_time: booking.end_time,
        date_key_ar: getArgentinaDateKey(booking.start_time),
        status: "confirmed",
        is_paid: true,
        deposit_amount: booking.deposit_amount,
        payment_method: "bank_transfer",
      });

    if (aptError) throw aptError;

    // Cache the IP so repeat bookings from this IP trigger login_required
    if (booking.ip_address) {
      const ipKey = `completed-booking:${booking.ip_address}:${booking.shop_id}`;
      completedBookingCache.set(ipKey, true);
    }

    // Send confirmation email
    if (booking.customer_email) {
      const { data: shop } = await admin
        .from("shops")
        .select("nombre, address, localidad, google_maps_url, phone, instagram_url, whatsapp_template")
        .eq("id", booking.shop_id)
        .maybeSingle();

      const shopData = shop as { nombre?: string | null; address?: string | null; localidad?: string | null; google_maps_url?: string | null; phone?: string | null; instagram_url?: string | null; whatsapp_template?: string | null } | null;
      const serviceName = (service as { name?: string | null } | null)?.name || "Servicio";
      const locationParts = [shopData?.address?.trim(), shopData?.localidad?.trim()].filter(Boolean);
      const shopAddress = locationParts.length > 0 ? locationParts.join(", ") : undefined;
      const mapsUrl = shopData?.google_maps_url?.trim() || undefined;
      const cleanPhone = shopData?.phone?.replace(/^\+/, "").replace(/\D/g, "") || "";
      const whatsappUrl = cleanPhone.length >= 7 ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shopData?.whatsapp_template || "Hola! Quiero consultar sobre un turno")}` : undefined;

      sendAppointmentConfirmationEmail({
        to: booking.customer_email,
        customerName: booking.customer_name,
        shopName: shopData?.nombre || "Klip",
        serviceName,
        shopAddress,
        startTime: booking.start_time,
        endTime: booking.end_time,
        mapsUrl,
        instagramUrl: shopData?.instagram_url?.trim() || undefined,
        whatsappUrl,
      }).catch((err) => console.error("[confirm-bank-transfer] email error:", err));
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al confirmar transferencia" };
  }
}

export async function rejectBankTransferBooking(
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
      .eq("status", "pending")
      .eq("payment_method", "bank_transfer");

    if (error) {
      return { success: false, error: "Error al rechazar transferencia" };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al rechazar transferencia" };
  }
}
