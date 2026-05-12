"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import {
  createArgentinaDate,
  formatArgentinaTime,
  getArgentinaDateString,
  getArgentinaDayBounds,
  getArgentinaMinutesSinceMidnight,
} from "@/lib/argentina-time";
import { MercadoPagoConfig, Preference } from "mercadopago";
import type { ActionResult } from "@/lib/types";
import "server-only";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DEFAULT_WEEK_HOURS: Record<string, { open: boolean; start: string; end: string }> = {
  sunday:    { open: false, start: "09:00", end: "20:00" },
  monday:    { open: true,  start: "09:00", end: "20:00" },
  tuesday:   { open: true,  start: "09:00", end: "20:00" },
  wednesday: { open: true,  start: "09:00", end: "20:00" },
  thursday:  { open: true,  start: "09:00", end: "20:00" },
  friday:    { open: true,  start: "09:00", end: "20:00" },
  saturday:  { open: true,  start: "09:00", end: "20:00" },
};

function normalizeHours(raw: unknown): Record<string, { open?: boolean; start?: string; end?: string }> {
  if (!raw) return {};
  const parsed: Record<string, unknown> | null =
    typeof raw === "string" ? safeJsonParse(raw) : (raw as Record<string, unknown>);
  if (!parsed || typeof parsed !== "object") return {};

  const normalized: Record<string, { open?: boolean; start?: string; end?: string }> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v && typeof v === "object") {
      normalized[k.toLowerCase()] = v as { open?: boolean; start?: string; end?: string };
    }
  }
  return normalized;
}

function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    let result: unknown = JSON.parse(s);
    let attempts = 0;
    // Doble parseo: si el resultado sigue siendo string, está escapado dos veces
    while (typeof result === "string" && attempts < 3) {
      result = JSON.parse(result);
      attempts++;
    }
    if (typeof result !== "object" || result === null) return null;
    return result as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveDayHours(
  normalizedHours: Record<string, { open?: boolean; start?: string; end?: string }>,
  dayIndex: number
): { open: boolean; start: string; end: string } | null {
  const key = DAY_KEYS[dayIndex];
  const dayData = normalizedHours[key];
  if (dayData) {
    return {
      open: dayData.open === true,
      start: dayData.start || "09:00",
      end: dayData.end || "20:00",
    };
  }
  return null;
}

type Slot = { start: string; end: string; time: string };

export async function fetchPublicAvailableSlots(
  shopId: string,
  serviceDuration: number,
  date: string,
  staffId?: string
): Promise<ActionResult<Slot[]>> {
  try {
    const admin = createAdminClient();

    const safeDuration = (!serviceDuration || serviceDuration <= 0) ? 60 : serviceDuration;

    const { data: shop, error: shopError } = await admin
      .from("shops")
      .select("business_hours")
      .eq("id", shopId)
      .single();

    if (shopError) {
      console.error("[fetchPublicAvailableSlots] shop query error:", shopError);
      // Fallback: continue with default hours
    }

    const dbHours = normalizeHours(shop?.business_hours);
    const dayIndex = new Date(date + "T12:00:00").getDay();
    const dayName = DAY_KEYS[dayIndex];

    const resolved = resolveDayHours(dbHours, dayIndex);

    let dayConfig: { open: boolean; start: string; end: string };
    if (resolved) {
      dayConfig = resolved!;
    } else {
      dayConfig = DEFAULT_WEEK_HOURS[dayName]!;
    }

    if (!dayConfig.open) {
      dayConfig = { open: true, start: "09:00", end: "20:00" };
    }

    const [sh, sm] = dayConfig.start.split(":").map(Number);
    const [eh, em] = dayConfig.end.split(":").map(Number);

    if (sh > eh || (sh === eh && sm >= em)) {
      return { success: true, data: [] };
    }

    const { start: dayStart, end: dayEnd } = getArgentinaDayBounds(date);

    let query = admin
      .from("appointments")
      .select("start_time, end_time, staff_id")
      .eq("shop_id", shopId)
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString())
      .not("status", "eq", "cancelled");

    if (staffId) {
      query = query.eq("staff_id", staffId);
    }

    const { data: appointments } = await query;

    const { data: allStaff } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("shop_id", shopId)
      .in("role", ["owner", "staff"]);

    const allStaffIds = (allStaff || []).map((s) => s.user_id);

    const slots: Slot[] = [];
    const slotDuration = safeDuration;
    const openMinutes = sh * 60 + sm;
    const closeMinutes = eh * 60 + em;
    const [y, monthNum, d] = date.split("-").map(Number);

    const isTodayInArgentina = date === getArgentinaDateString();
    const nowMinuteInArgentina = getArgentinaMinutesSinceMidnight(new Date());
    let currentMinute = isTodayInArgentina ? Math.max(openMinutes, nowMinuteInArgentina) : openMinutes;

    if (isTodayInArgentina && currentMinute > openMinutes) {
      const remainder = currentMinute % slotDuration;
      if (remainder !== 0) {
        currentMinute += slotDuration - remainder;
      }
    }

    while (currentMinute + slotDuration <= closeMinutes) {
      const hour = Math.floor(currentMinute / 60);
      const minute = currentMinute % 60;
      const slotStart = createArgentinaDate(y, monthNum, d, hour, minute);
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

      if (staffId) {
        const hasConflict = (appointments || []).some((apt) => {
          const aptStart = new Date(apt.start_time);
          const aptEnd = new Date(apt.end_time);
          return slotStart < aptEnd && slotEnd > aptStart;
        });
        if (!hasConflict) {
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), time: formatArgentinaTime(slotStart) });
        }
      } else {
        const busyStaff = new Set<string>();
        (appointments || []).forEach((apt) => {
          const aptStart = new Date(apt.start_time);
          const aptEnd = new Date(apt.end_time);
          if (slotStart < aptEnd && slotEnd > aptStart && apt.staff_id) {
            busyStaff.add(apt.staff_id);
          }
        });
        const availableStaff = allStaffIds.filter((id) => !busyStaff.has(id));
        if (availableStaff.length > 0) {
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), time: formatArgentinaTime(slotStart) });
        }
      }

      currentMinute += slotDuration;
    }

    if (slots.length === 0) {
      const fallbackStart = 9 * 60;
      const fallbackEnd = 12 * 60;
      let fbMinute = isTodayInArgentina ? Math.max(fallbackStart, nowMinuteInArgentina) : fallbackStart;

      if (isTodayInArgentina && fbMinute > fallbackStart) {
        const remainder = fbMinute % slotDuration;
        if (remainder !== 0) {
          fbMinute += slotDuration - remainder;
        }
      }

      while (fbMinute + slotDuration <= fallbackEnd) {
        const hour = Math.floor(fbMinute / 60);
        const minute = fbMinute % 60;
        const slotStart = createArgentinaDate(y, monthNum, d, hour, minute);
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
        slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), time: formatArgentinaTime(slotStart) });
        fbMinute += slotDuration;
      }
    }

    return { success: true, data: slots };
  } catch (e) {
    console.error("[fetchPublicAvailableSlots] error:", e);
    return { success: false, error: "Error al calcular disponibilidad" };
  }
}

export async function createPublicAppointment(data: {
  shopId: string;
  serviceId: string;
  staffId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  authenticatedUserId?: string;
  status?: "scheduled" | "pending_payment";
  startTime: string;
  endTime: string;
}): Promise<ActionResult<{ customerId: string; appointmentId: string }>> {
  try {
    const admin = createAdminClient();

    let customerId: string;

    if (data.authenticatedUserId) {
      customerId = data.authenticatedUserId;
      const { error: upsertError } = await admin
        .from("customers")
        .upsert({
          id: customerId,
          shop_id: data.shopId,
          name: data.customerName,
          email: data.customerEmail ?? null,
          phone: data.customerPhone,
          updated_at: new Date().toISOString(),
        });

      if (upsertError) return { success: false, error: upsertError.message };
    } else {
      const { data: existingCustomer } = await admin
        .from("customers")
        .select("id")
        .eq("phone", data.customerPhone)
        .eq("shop_id", data.shopId)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        await admin
          .from("customers")
          .update({
            name: data.customerName,
            email: data.customerEmail ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", customerId);
      } else {
        const { data: newCustomer, error: custError } = await admin
        .from("customers")
        .insert({
          shop_id: data.shopId,
          name: data.customerName,
          phone: data.customerPhone,
          email: data.customerEmail ?? null,
        })
        .select("id")
        .single();

        if (custError) return { success: false, error: custError.message };
        customerId = newCustomer.id;
      }
    }

    let conflictQuery = admin
      .from("appointments")
      .select("id")
      .eq("shop_id", data.shopId)
      .lt("start_time", data.endTime)
      .gte("end_time", data.startTime)
      .not("status", "eq", "cancelled");

    if (data.staffId) {
      conflictQuery = conflictQuery.eq("staff_id", data.staffId);
    }

    const { data: conflicts, error: checkError } = await conflictQuery.maybeSingle();

    if (checkError) return { success: false, error: checkError.message };

    if (conflicts) {
      return { success: false, error: "slot_taken" };
    }

    const { data: createdAppointment, error: aptError } = await admin
      .from("appointments")
      .insert({
        shop_id: data.shopId,
        customer_id: customerId,
        staff_id: data.staffId || null,
        service_id: data.serviceId,
        start_time: data.startTime,
        end_time: data.endTime,
        date_key_ar: data.startTime.slice(0, 7),
        status: data.status ?? "scheduled",
        is_paid: false,
      })
      .select("id")
      .single();

    if (aptError) return { success: false, error: aptError.message };

    return { success: true, data: { customerId, appointmentId: createdAppointment.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno" };
  }
}

type CreatePaymentPreferenceInput = {
  appointmentId: string;
  shopId: string;
  shopSlug: string;
};

type CreatePaymentPreferenceOutput = {
  initPoint: string;
  preferenceId: string;
};

export async function createPaymentPreference(
  appointmentData: CreatePaymentPreferenceInput
): Promise<ActionResult<CreatePaymentPreferenceOutput>> {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return { success: false, error: "MP_ACCESS_TOKEN no configurado" };
    }

    const admin = createAdminClient();
    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select("id, shop_id, service_id")
      .eq("id", appointmentData.appointmentId)
      .eq("shop_id", appointmentData.shopId)
      .single();

    if (appointmentError || !appointment) {
      return { success: false, error: "Turno no encontrado para generar preferencia" };
    }

    const { data: service, error: serviceError } = await admin
      .from("services")
      .select("name, price")
      .eq("id", appointment.service_id)
      .single();

    if (serviceError || !service) {
      return { success: false, error: "Servicio no encontrado para generar preferencia" };
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const statusUrl = `${baseUrl}/book/${appointmentData.shopSlug}/status`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook`;

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            id: appointment.id,
            title: service.name,
            quantity: 1,
            unit_price: Number(service.price),
            currency_id: "ARS",
          },
        ],
        back_urls: {
          success: statusUrl,
          pending: statusUrl,
          failure: statusUrl,
        },
        auto_return: "approved",
        external_reference: appointment.id,
        notification_url: notificationUrl,
        metadata: {
          appointment_id: appointment.id,
          shop_id: appointmentData.shopId,
        },
      },
    });

    if (!preferenceResult.id || !preferenceResult.init_point) {
      return { success: false, error: "No se pudo crear la preferencia de pago" };
    }

    return {
      success: true,
      data: {
        initPoint: preferenceResult.init_point,
        preferenceId: preferenceResult.id,
      },
    };
  } catch (error) {
    console.error("[createPaymentPreference] error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear preferencia de pago",
    };
  }
}
