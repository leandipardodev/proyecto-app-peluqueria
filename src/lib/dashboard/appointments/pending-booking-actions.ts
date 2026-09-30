"use server";

import { canAccessShopId, createServiceRoleClient, getAuthSession } from "@/lib/dashboard/auth/server";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import { sendAppointmentConfirmationEmail } from "@/lib/email/booking-emails";
import { completedBookingCache } from "@/lib/booking-cache";
import { isOverlapViolation } from "@/lib/db/overlap-violation";
import "server-only";

/**
 * Verifica que el caller sea miembro activo del local indicado.
 *
 * Este archivo tiene "use server" a nivel de modulo, asi que TODOS sus exports
 * son endpoints RPC publicos aunque solo se llamen desde el servidor. Sin este
 * guard, `getPendingBankTransfers` devolvia nombres y telefonos de los clientes
 * de cualquier salon, y `confirmBankTransferBooking` creaba un turno confirmado
 * y pagado en un local ajeno disparando los emails de confirmacion.
 */
async function requireShopAccess(shopId: string): Promise<ActionResult<string>> {
  if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
  const session = await getAuthSession();
  if (!session) return { success: false, error: "SESION_EXPIRADA" };
  const allowed = await canAccessShopId(session.user.id, shopId);
  if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };
  return { success: true, data: shopId };
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
    const access = await requireShopAccess(shopId);
    if (!access.success) return { success: false, error: access.error };

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
    const access = await requireShopAccess(shopId);
    if (!access.success) return { success: false, error: access.error };

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

    if (aptError) {
      // 23P01 = la constraint de la migracion 109: el horario ya tiene un turno
      // confirmed de ese profesional. El local necesita verlo como "horario
      // ocupado" para reubicar la reserva, no como una excepcion.
      if (isOverlapViolation(aptError)) return { success: false, error: "slot_taken" };
      throw aptError;
    }

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
    const access = await requireShopAccess(shopId);
    if (!access.success) return { success: false, error: access.error };

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
