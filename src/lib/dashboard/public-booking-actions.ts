"use server";

import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import {
  createArgentinaDate,
  formatArgentinaTime,
  getArgentinaDateKey,
  getArgentinaDateString,
  getArgentinaDayBounds,
  getArgentinaMinutesSinceMidnight,
} from "@/lib/argentina-time";
import { MercadoPagoConfig, Preference } from "mercadopago";
import type { ActionResult } from "@/lib/types";
import { sendEmailWithResend } from "@/lib/email/resend";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

async function sendAppointmentConfirmationEmail(params: {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  startTime: string;
  replyTo?: string;
}): Promise<void> {
  const appointmentDate = new Date(params.startTime);
  const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const when = `${dateLabel} a las ${timeLabel}`;

  await sendEmailWithResend({
    to: params.to,
    subject: `Confirmado! Tu turno el ${dateLabel} a las ${timeLabel}`,
    replyTo: params.replyTo,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:22px;margin:0 0 12px;">Tu turno fue reservado</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hola ${params.customerName}, ya confirmamos tu reserva.</p>
        <p style="font-size:15px;line-height:1.6;margin:0;">
          <strong>Local:</strong> ${params.shopName}<br/>
          <strong>Servicio:</strong> ${params.serviceName}<br/>
          <strong>Fecha y hora:</strong> ${when}
        </p>
        <p style="font-size:12px;color:#6b7280;margin-top:18px;">Klip - no-reply@send.klip.com.ar</p>
      </div>
    `,
  });
}

async function scheduleAppointmentReminderEmail(params: {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  shopAddress?: string;
  startTime: string;
  replyTo?: string;
}): Promise<void> {
  const reminderDate = new Date(new Date(params.startTime).getTime() - 3 * 60 * 60 * 1000);
  if (reminderDate <= new Date()) {
    return;
  }

  const appointmentDate = new Date(params.startTime);
  const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const mapsUrl = params.shopAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.shopAddress)}`
    : null;
  const locationLine = params.shopAddress
    ? `<p style="font-size:14px;line-height:1.6;margin:4px 0 14px;"><strong>Direccion:</strong> ${params.shopAddress}</p>`
    : "";
  const mapsButton = mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0071E3;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-size:13px;font-weight:600;">Ver ubicacion en Google Maps</a>`
    : "";

  await sendEmailWithResend({
    to: params.to,
    subject: `⏰ Recordatorio: Tenes un turno en ${params.shopName}`,
    scheduledAt: reminderDate.toISOString(),
    replyTo: params.replyTo,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;">
        <h1 style="font-size:22px;margin:0 0 12px;">Recordatorio de turno</h1>
        <p style="font-size:15px;line-height:1.65;margin:0 0 16px;">Hola ${params.customerName}, este es un recordatorio de tu turno para hoy.</p>
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
          <p style="font-size:14px;line-height:1.6;margin:0 0 4px;"><strong>Peluqueria:</strong> ${params.shopName}</p>
          <p style="font-size:14px;line-height:1.6;margin:4px 0;"><strong>Servicio:</strong> ${params.serviceName}</p>
          <p style="font-size:14px;line-height:1.6;margin:4px 0;"><strong>Hora:</strong> ${dateLabel} a las ${timeLabel}</p>
          ${locationLine}
          ${mapsButton}
        </div>
        <p style="font-size:12px;line-height:1.6;color:#6b7280;margin-top:14px;">Este es un aviso automatico. No respondas a este mail. Si necesitas cancelar, contacta a la peluqueria directamente.</p>
        <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Klip Turnos - no-reply@send.klip.com.ar</p>
      </div>
    `,
  });
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DEFAULT_WEEK_HOURS: Record<string, { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null }> = {
  sunday:    { open: false, start: "09:00", end: "20:00" },
  monday:    { open: true,  start: "09:00", end: "20:00" },
  tuesday:   { open: true,  start: "09:00", end: "20:00" },
  wednesday: { open: true,  start: "09:00", end: "20:00" },
  thursday:  { open: true,  start: "09:00", end: "20:00" },
  friday:    { open: true,  start: "09:00", end: "20:00" },
  saturday:  { open: true,  start: "09:00", end: "20:00" },
};

function normalizeHours(raw: unknown): Record<string, { open?: boolean; start?: string; end?: string; break_start?: string | null; break_end?: string | null }> {
  if (!raw) return {};
  const parsed: Record<string, unknown> | null =
    typeof raw === "string" ? safeJsonParse(raw) : (raw as Record<string, unknown>);
  if (!parsed || typeof parsed !== "object") return {};

  const normalized: Record<string, { open?: boolean; start?: string; end?: string; break_start?: string | null; break_end?: string | null }> = {};
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
  normalizedHours: Record<string, { open?: boolean; start?: string; end?: string; break_start?: string | null; break_end?: string | null }>,
  dayIndex: number
): { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null } | null {
  const key = DAY_KEYS[dayIndex];
  const dayData = normalizedHours[key];
  if (dayData) {
    return {
      open: dayData.open === true,
      start: dayData.start || "09:00",
      end: dayData.end || "20:00",
      break_start: dayData.break_start || null,
      break_end: dayData.break_end || null,
    };
  }
  return null;
}

type Slot = { start: string; end: string; time: string };

const PENDING_PAYMENT_HOLD_MINUTES = 15;

function isPendingPaymentStillBlocking(status: string | null | undefined, createdAt: string | null | undefined): boolean {
  if (status !== "pending_payment") return true;
  if (!createdAt) return false;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;
  return Date.now() - createdAtMs <= PENDING_PAYMENT_HOLD_MINUTES * 60 * 1000;
}

export async function fetchPublicAvailableSlots(
  shopId: string,
  serviceDuration: number,
  date: string,
  staffId?: string
): Promise<ActionResult<Slot[]>> {
  try {
    const admin = await createAdminClient();

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

    let dayConfig: { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null };
    if (resolved) {
      dayConfig = resolved!;
    } else {
      dayConfig = DEFAULT_WEEK_HOURS[dayName]!;
    }

    if (!dayConfig.open) {
      return { success: true, data: [] };
    }

    const [sh, sm] = dayConfig.start.split(":").map(Number);
    const [eh, em] = dayConfig.end.split(":").map(Number);
    const scheduleBlocks: Array<{ openMinutes: number; closeMinutes: number }> = [];
    const fullOpen = sh * 60 + sm;
    const fullClose = eh * 60 + em;

    if (fullOpen >= fullClose) return { success: true, data: [] };

    if (dayConfig.break_start && dayConfig.break_end) {
      const [bsh, bsm] = dayConfig.break_start.split(":").map(Number);
      const [beh, bem] = dayConfig.break_end.split(":").map(Number);
      const breakStart = bsh * 60 + bsm;
      const breakEnd = beh * 60 + bem;
      if (fullOpen < breakStart && breakStart < breakEnd && breakEnd < fullClose) {
        scheduleBlocks.push({ openMinutes: fullOpen, closeMinutes: breakStart });
        scheduleBlocks.push({ openMinutes: breakEnd, closeMinutes: fullClose });
      } else {
        scheduleBlocks.push({ openMinutes: fullOpen, closeMinutes: fullClose });
      }
    } else {
      scheduleBlocks.push({ openMinutes: fullOpen, closeMinutes: fullClose });
    }

    const { start: dayStart, end: dayEnd } = getArgentinaDayBounds(date);

    let query = admin
      .from("appointments")
      .select("start_time, end_time, staff_id, status, created_at")
      .eq("shop_id", shopId)
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString())
      .not("status", "eq", "cancelled");

    if (staffId) {
      query = query.eq("staff_id", staffId);
    }

    const { data: appointmentsRaw } = await query;
    const appointments = (appointmentsRaw || []).filter((apt) =>
      isPendingPaymentStillBlocking(apt.status as string | null | undefined, apt.created_at as string | null | undefined)
    );

    const { data: allStaff } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("shop_id", shopId)
      .in("role", ["owner", "staff"]);

    const allStaffIds = (allStaff || []).map((s) => s.user_id);

    const slots: Slot[] = [];
    const slotDuration = safeDuration;
    const [y, monthNum, d] = date.split("-").map(Number);

    const isTodayInArgentina = date === getArgentinaDateString();
    const nowMinuteInArgentina = getArgentinaMinutesSinceMidnight(new Date());
    for (const block of scheduleBlocks) {
      let currentMinute = isTodayInArgentina ? Math.max(block.openMinutes, nowMinuteInArgentina) : block.openMinutes;

      if (isTodayInArgentina && currentMinute > block.openMinutes) {
        const remainder = currentMinute % slotDuration;
        if (remainder !== 0) {
          currentMinute += slotDuration - remainder;
        }
      }

      while (currentMinute + slotDuration <= block.closeMinutes) {
        const hour = Math.floor(currentMinute / 60);
        const minute = currentMinute % 60;
        const slotStart = createArgentinaDate(y, monthNum, d, hour, minute);
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

        if (staffId) {
          const hasConflict = appointments.some((apt) => {
            const aptStart = new Date(apt.start_time);
            const aptEnd = new Date(apt.end_time);
            return slotStart < aptEnd && slotEnd > aptStart;
          });
          if (!hasConflict) {
            slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), time: formatArgentinaTime(slotStart) });
          }
        } else {
          const busyStaff = new Set<string>();
          appointments.forEach((apt) => {
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
    const admin = await createAdminClient();

    const startDate = new Date(data.startTime);
    const endDate = new Date(data.endTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return { success: false, error: "Horario invalido" };
    }

    const bookingDate = getArgentinaDateKey(data.startTime);
    const { data: shopHoursData } = await admin
      .from("shops")
      .select("business_hours")
      .eq("id", data.shopId)
      .maybeSingle();

    const normalizedHours = normalizeHours(shopHoursData?.business_hours);
    const dayIndex = new Date(`${bookingDate}T12:00:00-03:00`).getDay();
    const dayName = DAY_KEYS[dayIndex];
    const resolved = resolveDayHours(normalizedHours, dayIndex);
    const dayConfig = resolved || DEFAULT_WEEK_HOURS[dayName] || { open: false, start: "09:00", end: "20:00" };

    if (!dayConfig.open) {
      return { success: false, error: "El local esta cerrado en ese horario" };
    }

    const [sh, sm] = dayConfig.start.split(":").map(Number);
    const [eh, em] = dayConfig.end.split(":").map(Number);
    const startMinutes = getArgentinaMinutesSinceMidnight(data.startTime);
    const endMinutes = getArgentinaMinutesSinceMidnight(data.endTime);
    const openMinutes = sh * 60 + sm;
    const closeMinutes = eh * 60 + em;

    let isInsideOpenHours = startMinutes >= openMinutes && endMinutes <= closeMinutes;
    if (isInsideOpenHours && dayConfig.break_start && dayConfig.break_end) {
      const [bsh, bsm] = dayConfig.break_start.split(":").map(Number);
      const [beh, bem] = dayConfig.break_end.split(":").map(Number);
      const breakStart = bsh * 60 + bsm;
      const breakEnd = beh * 60 + bem;
      const overlapsBreak = startMinutes < breakEnd && endMinutes > breakStart;
      if (overlapsBreak) isInsideOpenHours = false;
    }

    if (!isInsideOpenHours) {
      return { success: false, error: "El horario seleccionado esta fuera del horario de atencion" };
    }

    let customerId: string;

    if (data.authenticatedUserId) {
      customerId = data.authenticatedUserId;
      const { error: upsertError } = await admin
        .from("customers")
        .upsert({
          id: customerId,
          user_id: customerId,
          shop_id: data.shopId,
          nombre: data.customerName,
          email: data.customerEmail ?? null,
          telefono: data.customerPhone,
          updated_at: new Date().toISOString(),
        });

      if (upsertError) return { success: false, error: upsertError.message };
    } else {
      const { data: existingCustomer } = await admin
        .from("customers")
        .select("id")
        .eq("shop_id", data.shopId)
        .eq("telefono", data.customerPhone)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        await admin
          .from("customers")
          .update({
            nombre: data.customerName,
            email: data.customerEmail ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", customerId);
      } else {
        const { data: newCustomer, error: custError } = await admin
        .from("customers")
        .insert({
          user_id: data.authenticatedUserId ?? null,
          shop_id: data.shopId,
          nombre: data.customerName,
          telefono: data.customerPhone,
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
      .select("id, status, created_at")
      .eq("shop_id", data.shopId)
      .lt("start_time", data.endTime)
      .gt("end_time", data.startTime)
      .not("status", "eq", "cancelled");

    if (data.staffId) {
      conflictQuery = conflictQuery.eq("staff_id", data.staffId);
    }

    const { data: conflictsRaw, error: checkError } = await conflictQuery;

    if (checkError) return { success: false, error: checkError.message };

    const hasBlockingConflict = (conflictsRaw || []).some((apt) =>
      isPendingPaymentStillBlocking(apt.status as string | null | undefined, apt.created_at as string | null | undefined)
    );

    if (hasBlockingConflict) {
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
        date_key_ar: getArgentinaDateKey(data.startTime),
        status: data.status ?? "scheduled",
        is_paid: false,
      })
      .select("id")
      .single();

    if (aptError) return { success: false, error: aptError.message };

    if (data.customerEmail) {
      try {
        const [{ data: shop }, { data: service }] = await Promise.all([
          admin.from("shops").select("*").eq("id", data.shopId).maybeSingle(),
          admin.from("services").select("name").eq("id", data.serviceId).maybeSingle(),
        ]);

        const shopData = (shop as { nombre?: string | null; email?: string | null; address?: string | null } | null) || null;
        const serviceName = (service as { name?: string | null } | null)?.name || "Servicio";
        const replyTo = shopData?.email && shopData.email.includes("@") ? shopData.email : undefined;

        await sendAppointmentConfirmationEmail({
          to: data.customerEmail,
          customerName: data.customerName,
          shopName: shopData?.nombre || "Klip",
          serviceName,
          startTime: data.startTime,
          replyTo,
        });

        await scheduleAppointmentReminderEmail({
          to: data.customerEmail,
          customerName: data.customerName,
          shopName: shopData?.nombre || "Klip",
          serviceName,
          shopAddress: shopData?.address || undefined,
          startTime: data.startTime,
          replyTo,
        });
      } catch (mailError) {
        console.error("[createPublicAppointment] confirmation email error:", mailError);
      }
    }

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
  chargedAmount: number;
  isDeposit: boolean;
};

type DeletePublicAppointmentInput = {
  appointmentId: string;
  shopId: string;
};

export async function deletePublicAppointment(input: DeletePublicAppointmentInput): Promise<ActionResult> {
  try {
    const admin = await createAdminClient();
    const { error } = await admin
      .from("appointments")
      .delete()
      .eq("id", input.appointmentId)
      .eq("shop_id", input.shopId)
      .eq("status", "pending_payment");

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar turno pendiente" };
  }
}

export async function createPaymentPreference(
  appointmentData: CreatePaymentPreferenceInput
): Promise<ActionResult<CreatePaymentPreferenceOutput>> {
  try {
    const admin = await createAdminClient();
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

    const { data: shopPolicy } = await admin
      .from("shops")
      .select("booking_deposit_enabled, booking_deposit_amount, mp_access_token")
      .eq("id", appointmentData.shopId)
      .single();

    const accessToken = (shopPolicy?.mp_access_token as string | undefined) || process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return { success: false, error: "Configura el Access Token de Mercado Pago en Mi Negocio" };
    }

    const servicePrice = Math.max(0, Number(service.price) || 0);
    const depositEnabled = shopPolicy?.booking_deposit_enabled !== false;
    const configuredDeposit = Math.max(0, Number(shopPolicy?.booking_deposit_amount || 0));
    const chargeAmount = depositEnabled
      ? Math.max(1, Math.min(servicePrice, configuredDeposit || servicePrice))
      : Math.max(1, servicePrice);

    await admin
      .from("appointments")
      .update({
        deposit_amount: chargeAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id)
      .eq("shop_id", appointmentData.shopId);

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
    const successUrl = `${baseUrl}/confirmacion?status=success&slug=${encodeURIComponent(appointmentData.shopSlug)}`;
    const pendingUrl = `${baseUrl}/confirmacion?status=pending&slug=${encodeURIComponent(appointmentData.shopSlug)}`;
    const failureUrl = `${baseUrl}/confirmacion?status=failure&slug=${encodeURIComponent(appointmentData.shopSlug)}`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook`;
    const canUseBackUrls = /^https?:\/\//.test(baseUrl) && !/localhost|127\.0\.0\.1/.test(baseUrl);
    const shouldSendWebhook = notificationUrl.startsWith("https://");

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            id: appointment.id,
            title: depositEnabled ? `Seña - ${service.name}` : service.name,
            quantity: 1,
            unit_price: chargeAmount,
            currency_id: "ARS",
          },
        ],
        back_urls: canUseBackUrls
          ? {
              success: successUrl,
              pending: pendingUrl,
              failure: failureUrl,
            }
          : undefined,
        auto_return: canUseBackUrls ? "approved" : undefined,
        external_reference: appointment.id,
        notification_url: shouldSendWebhook ? notificationUrl : undefined,
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
        chargedAmount: chargeAmount,
        isDeposit: depositEnabled,
      },
    };
  } catch (error) {
    console.error("[createPaymentPreference] error:", error);
    const sdkMessage =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
    const sdkCause =
      error && typeof error === "object" && "cause" in error
        ? JSON.stringify((error as { cause?: unknown }).cause)
        : "";
    const detailedMessage = [sdkMessage, sdkCause].filter(Boolean).join(" | ");
    return {
      success: false,
      error: detailedMessage || (error instanceof Error ? error.message : "Error al crear preferencia de pago"),
    };
  }
}
