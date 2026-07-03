"use server";

import { randomUUID } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { canAccessShopId, requireShopId } from "@/lib/dashboard/auth-server";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { revalidateDashboardSegments } from "@/lib/dashboard/revalidate-dashboard";
import { createArgentinaDate, getArgentinaDateKey, getArgentinaNow } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import {
  type RecurringFrequency,
  createAdminClient,
  sendAppointmentAutomationEmails,
  toArgentinaStartEnd,
  buildRecurringStarts,
  registerLoyaltyCut,
} from "./appointment-shared";
import "server-only";

export async function createAppointment(formData: FormData, shopId: string): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const customerId = formData.get("customer_id") as string;
    const staffIdRaw = (formData.get("staff_id") as string) || "";
    const staffId = staffIdRaw.trim();
    const serviceIdsRaw = (formData.get("service_ids") as string) || formData.get("service_id") as string;
    const startDate = formData.get("start_date") as string;
    const startTime = formData.get("start_time") as string;
    const recurringFrequency = ((formData.get("recurring_frequency") as string) || "none") as RecurringFrequency;
    const recurringUntil = ((formData.get("recurring_until") as string) || "").trim() || null;
    const notes = formData.get("notes") as string;
    const depositAmountRaw = (formData.get("deposit_amount") as string) || "";
    const depositAmount = depositAmountRaw ? Number(depositAmountRaw) : null;

    const serviceIds = serviceIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!customerId || serviceIds.length === 0 || !startDate || !startTime) {
      const missing = [];
      if (!customerId) missing.push("cliente");
      if (serviceIds.length === 0) missing.push("servicio");
      if (!startDate) missing.push("fecha");
      if (!startTime) missing.push("hora");
      return { success: false, error: `Faltan campos obligatorios: ${missing.join(", ")}` };
    }
    if (depositAmount !== null && (Number.isNaN(depositAmount) || depositAmount < 0)) {
      return { success: false, error: "La seña debe ser un monto válido" };
    }

    const serviceDurationsRaw = (formData.get("service_durations") as string) || "{}";
    let serviceDurations: Record<string, number> = {};
    try { serviceDurations = JSON.parse(serviceDurationsRaw); } catch { serviceDurations = {}; }
    for (const [_id, minutes] of Object.entries(serviceDurations)) {
      if (minutes < 1 || minutes > 300) {
        return { success: false, error: "Duración inválida para un servicio. Máximo 300 min (5 hs)." };
      }
    }

    const supabase = await createServerClient();

    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("id, duration_minutes, price, name")
      .in("id", serviceIds);

    if (servicesError) return { success: false, error: servicesError.message };
    if (!services || services.length !== serviceIds.length) {
      return { success: false, error: "Uno o más servicios no encontrados" };
    }

    if (staffId) {
      const { data: staffServiceRows } = await supabase
        .from("staff_services")
        .select("service_id")
        .eq("staff_id", staffId);
      if (staffServiceRows && staffServiceRows.length > 0) {
        const assignedIds = new Set(staffServiceRows.map((r) => r.service_id));
        const unassigned = serviceIds.filter((id) => !assignedIds.has(id));
        if (unassigned.length > 0) {
          return { success: false, error: "El profesional no realiza uno o más servicios seleccionados" };
        }
      }
    }

    const orderedServices = serviceIds.map((id) => services.find((s) => s.id === id)!);
    const totalDuration = orderedServices.reduce((sum, s) => sum + (serviceDurations[s.id] ?? s.duration_minutes), 0);

    const { start } = await toArgentinaStartEnd(startDate, startTime, totalDuration);
    const recurringStarts = await buildRecurringStarts(start, recurringFrequency, recurringUntil);

    if (recurringFrequency !== "none" && orderedServices.length > 1) {
      return { success: false, error: "No se puede repetir un turno con múltiples servicios" };
    }

    const recurringGroupId = recurringStarts.length > 1 ? randomUUID() : null;

    const rowsToInsert = recurringStarts.flatMap((startAt) => {
      let currentStart = new Date(startAt);
      return orderedServices.map((svc) => {
        const effectiveDuration = serviceDurations[svc.id] ?? svc.duration_minutes;
        const currentEnd = new Date(currentStart.getTime() + effectiveDuration * 60000);
        const row = {
          shop_id: shopId,
          customer_id: customerId,
          staff_id: staffId || null,
          service_id: svc.id,
          service_price: svc.price ?? null,
          start_time: currentStart.toISOString(),
          end_time: currentEnd.toISOString(),
          date_key_ar: getArgentinaDateKey(currentStart.toISOString()),
          status: "scheduled" as const,
          deposit_amount: depositAmount,
          is_paid: false,
          recurring_group_id: recurringGroupId,
          notes: notes || null,
        };
        currentStart = currentEnd;
        return row;
      });
    });

    if (staffId && rowsToInsert.length > 0) {
      const conditions = rowsToInsert.map(
        (row) => `and(end_time.gt.${row.start_time},start_time.lt.${row.end_time})`
      );
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .eq("staff_id", staffId)
        .not("status", "eq", "cancelled")
        .or(conditions.join(","))
        .limit(1);
      if (conflict && conflict.length > 0) return { success: false, error: "slot_taken" };
    }

    const { error } = await supabase.from("appointments").insert(rowsToInsert);
    if (error) return { success: false, error: error.message };

    try {
      const admin = await createAdminClient();
      const [{ data: customer }, { data: shopData }] = await Promise.all([
        supabase.from("customers").select("nombre, email").eq("id", customerId).maybeSingle(),
        admin.from("shops").select("nombre, email, address, localidad").eq("id", shopId).maybeSingle(),
      ]);

      const emailTo = customer?.email?.trim();
      if (emailTo) {
        const sd = shopData as { nombre?: string | null; email?: string | null; address?: string | null; localidad?: string | null } | null;
        const locationParts = [sd?.address?.trim(), sd?.localidad?.trim()].filter(Boolean);
        const shopAddress = locationParts.length > 0 ? locationParts.join(", ") : undefined;
        const replyTo = sd?.email && sd.email.includes("@") ? sd.email : undefined;
        const serviceNames = orderedServices.map((s) => s.name).join(", ");
        const firstRow = rowsToInsert[0];
        if (firstRow) {
          await sendAppointmentAutomationEmails({
            to: emailTo,
            customerName: customer?.nombre || "Cliente",
            shopName: sd?.nombre || "Klip",
            serviceName: serviceNames,
            startTime: firstRow.start_time,
            shopAddress,
            replyTo,
          }).catch((mailError) => console.error("[createAppointment] email automation error:", mailError));
        }
      }
    } catch (mailError) {
      console.error("[createAppointment] email automation error:", mailError);
    }

    await revalidateDashboardSegments(shopId, ["/calendar", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno" };
  }
}

export async function createCustomerAndAppointment(formData: FormData, shopId: string): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const customerName = formData.get("customer_name") as string;
    const customerEmail = formData.get("customer_email") as string;
    const customerPhone = formData.get("customer_phone") as string;
    const staffIdRaw = (formData.get("staff_id") as string) || "";
    const staffId = staffIdRaw.trim();
    const serviceIdsRaw = (formData.get("service_ids") as string) || formData.get("service_id") as string;
    const startDate = formData.get("start_date") as string;
    const startTime = formData.get("start_time") as string;
    const notes = formData.get("notes") as string;
    const depositAmountRaw = (formData.get("deposit_amount") as string) || "";
    const depositAmount = depositAmountRaw ? Number(depositAmountRaw) : null;

    const serviceIds = serviceIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!customerName || serviceIds.length === 0 || !startDate || !startTime) {
      const missing = [];
      if (!customerName) missing.push("nombre del cliente");
      if (serviceIds.length === 0) missing.push("servicio");
      if (!startDate) missing.push("fecha");
      if (!startTime) missing.push("hora");
      return { success: false, error: `Faltan campos obligatorios: ${missing.join(", ")}` };
    }
    if (depositAmount !== null && (Number.isNaN(depositAmount) || depositAmount < 0)) {
      return { success: false, error: "La seña debe ser un monto válido" };
    }

    const serviceDurationsRaw = (formData.get("service_durations") as string) || "{}";
    let serviceDurations: Record<string, number> = {};
    try { serviceDurations = JSON.parse(serviceDurationsRaw); } catch { serviceDurations = {}; }
    for (const [_id, minutes] of Object.entries(serviceDurations)) {
      if (minutes < 1 || minutes > 300) {
        return { success: false, error: "Duración inválida para un servicio. Máximo 300 min (5 hs)." };
      }
    }

    const supabase = await createServerClient();

    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("id, duration_minutes, price, name")
      .in("id", serviceIds);

    if (servicesError) return { success: false, error: servicesError.message };
    if (!services || services.length !== serviceIds.length) {
      return { success: false, error: "Uno o más servicios no encontrados" };
    }

    if (staffId) {
      const { data: staffServiceRows } = await supabase
        .from("staff_services")
        .select("service_id")
        .eq("staff_id", staffId);
      if (staffServiceRows && staffServiceRows.length > 0) {
        const assignedIds = new Set(staffServiceRows.map((r) => r.service_id));
        const unassigned = serviceIds.filter((id) => !assignedIds.has(id));
        if (unassigned.length > 0) {
          return { success: false, error: "El profesional no realiza uno o más servicios seleccionados" };
        }
      }
    }

    const orderedServices = serviceIds.map((id) => services.find((s) => s.id === id)!);
    const totalDuration = orderedServices.reduce((sum, s) => sum + (serviceDurations[s.id] ?? s.duration_minutes), 0);

    const { data: newCustomer, error: customerInsertError } = await supabase
      .from("customers")
      .insert({
        shop_id: shopId,
        nombre: customerName,
        email: customerEmail || null,
        telefono: customerPhone || null,
      })
      .select("id")
      .single();
    if (customerInsertError) return { success: false, error: `Error al crear cliente: ${customerInsertError.message}` };
    const customerId = newCustomer.id;
    const recurringFrequency = ((formData.get("recurring_frequency") as string) || "none") as RecurringFrequency;
    const recurringUntil = ((formData.get("recurring_until") as string) || "").trim() || null;

    const { start } = await toArgentinaStartEnd(startDate, startTime, totalDuration);
    const recurringStarts = await buildRecurringStarts(start, recurringFrequency, recurringUntil);

    if (recurringFrequency !== "none" && orderedServices.length > 1) {
      return { success: false, error: "No se puede repetir un turno con múltiples servicios" };
    }

    const recurringGroupId = recurringStarts.length > 1 ? randomUUID() : null;

    const rowsToInsert = recurringStarts.flatMap((startAt) => {
      let currentStart = new Date(startAt);
      return orderedServices.map((svc) => {
        const effectiveDuration = serviceDurations[svc.id] ?? svc.duration_minutes;
        const currentEnd = new Date(currentStart.getTime() + effectiveDuration * 60000);
        const row = {
          shop_id: shopId,
          customer_id: customerId,
          staff_id: staffId || null,
          service_id: svc.id,
          service_price: svc.price ?? null,
          start_time: currentStart.toISOString(),
          end_time: currentEnd.toISOString(),
          date_key_ar: getArgentinaDateKey(currentStart.toISOString()),
          status: "scheduled" as const,
          deposit_amount: depositAmount,
          is_paid: false,
          recurring_group_id: recurringGroupId,
          notes: notes || null,
        };
        currentStart = currentEnd;
        return row;
      });
    });

    if (staffId && rowsToInsert.length > 0) {
      const conditions = rowsToInsert.map(
        (row) => `and(end_time.gt.${row.start_time},start_time.lt.${row.end_time})`
      );
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .eq("staff_id", staffId)
        .not("status", "eq", "cancelled")
        .or(conditions.join(","))
        .limit(1);
      if (conflict && conflict.length > 0) return { success: false, error: "slot_taken" };
    }

    const { error: insertError } = await supabase.from("appointments").insert(rowsToInsert);
    if (insertError) return { success: false, error: insertError.message };

    try {
      const admin = await createAdminClient();
      const [{ data: shopData }] = await Promise.all([
        admin.from("shops").select("nombre, email, address, localidad").eq("id", shopId).maybeSingle(),
      ]);

      if (customerEmail?.trim()) {
        const sd = shopData as { nombre?: string | null; email?: string | null; address?: string | null; localidad?: string | null } | null;
        const locationParts = [sd?.address?.trim(), sd?.localidad?.trim()].filter(Boolean);
        const shopAddress = locationParts.length > 0 ? locationParts.join(", ") : undefined;
        const replyTo = sd?.email && sd.email.includes("@") ? sd.email : undefined;
        const serviceNames = orderedServices.map((s) => s.name).join(", ");
        await Promise.allSettled(
          rowsToInsert.map((row) =>
            sendAppointmentAutomationEmails({
              to: customerEmail.trim(),
              customerName: customerName,
              shopName: sd?.nombre || "Klip",
              serviceName: serviceNames,
              startTime: row.start_time,
              shopAddress,
              replyTo,
            })
          )
        );
      }
    } catch (mailError) {
      console.error("[createCustomerAndAppointment] email automation error:", mailError);
    }

    await revalidateDashboardSegments(shopId, ["/calendar", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno y cliente" };
  }
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  isPaid?: boolean,
  shopId?: string,
  depositAmount?: number | null
): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const supabase = await createServerClient();

    const { data: currentAppointment, error: currentAppointmentError } = await supabase
      .from("appointments")
      .select("status, customer_id")
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (currentAppointmentError) return { success: false, error: currentAppointmentError.message };
    if (!currentAppointment) return { success: false, error: "Turno no encontrado" };

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "completed" && isPaid === undefined) {
      updates.is_paid = true;
    }
    if (isPaid !== undefined) {
      updates.is_paid = isPaid;
    }
    if (depositAmount !== undefined) {
      if (depositAmount !== null && (Number.isNaN(depositAmount) || depositAmount < 0)) {
        return { success: false, error: "La seña debe ser un monto válido" };
      }
      updates.deposit_amount = depositAmount;
      if (isPaid === undefined && depositAmount !== null) {
        updates.is_paid = depositAmount > 0;
      }
    }

    const { error } = await supabase
      .from("appointments")
      .update(updates)
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    const shouldRegisterLoyaltyCut =
      status === "completed" &&
      currentAppointment.status !== "completed" &&
      typeof currentAppointment.customer_id === "string" &&
      currentAppointment.customer_id.length > 0;

    if (shouldRegisterLoyaltyCut) {
      const loyaltyResult = await registerLoyaltyCut(shopId, currentAppointment.customer_id as string);
      if (!loyaltyResult.success) {
        return loyaltyResult;
      }
    }

    await revalidateDashboardSegments(shopId, ["/calendar", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar turno" };
  }
}

export async function updateAppointmentStaff(
  id: string,
  staffId: string | null,
  shopId?: string
): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const supabase = await createServerClient();
    const normalizedStaffId = staffId && staffId.trim().length > 0 ? staffId.trim() : null;

    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status")
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (aptError) return { success: false, error: aptError.message };
    if (!appointment) return { success: false, error: "Turno no encontrado" };

    if (normalizedStaffId) {
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .eq("staff_id", normalizedStaffId)
        .not("status", "eq", "cancelled")
        .gt("end_time", appointment.start_time)
        .lt("start_time", appointment.end_time)
        .neq("id", id)
        .maybeSingle();

      if (conflict) return { success: false, error: "slot_taken" };
    }

    const { error } = await supabase
      .from("appointments")
      .update({ staff_id: normalizedStaffId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar staff del turno" };
  }
}

export async function patchAppointmentQuick(
  id: string,
  patch: { status?: string; isPaid?: boolean; staffId?: string | null; serviceId?: string; startTime?: string },
  shopId?: string,
): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const supabase = await createServerClient();
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status, customer_id, service_id, staff_id")
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (aptError) return { success: false, error: aptError.message };
    if (!appointment) return { success: false, error: "Turno no encontrado" };

    const normalizedStaffId = patch.staffId !== undefined
      ? (patch.staffId && patch.staffId.trim().length > 0 ? patch.staffId.trim() : null)
      : undefined;

    const normalizedServiceId = patch.serviceId !== undefined
      ? patch.serviceId.trim()
      : undefined;

    let nextStartIso = appointment.start_time;
    if (patch.startTime !== undefined) {
      const parsed = new Date(patch.startTime);
      if (Number.isNaN(parsed.getTime())) return { success: false, error: "Fecha/hora invalida" };
      nextStartIso = parsed.toISOString();
    }

    let durationMinutes = Math.max(1, Math.round((new Date(appointment.end_time).getTime() - new Date(appointment.start_time).getTime()) / 60000));
    let nextService: { id: string; duration_minutes: number; price: number | null } | null = null;
    if (normalizedServiceId !== undefined) {
      const { data: nextServiceData, error: nextServiceError } = await supabase
        .from("services")
        .select("id, duration_minutes, price")
        .eq("id", normalizedServiceId)
        .eq("shop_id", shopId)
        .maybeSingle();
      if (nextServiceError) return { success: false, error: nextServiceError.message };
      if (!nextServiceData) return { success: false, error: "Servicio invalido" };
      nextService = nextServiceData;
      durationMinutes = Math.max(1, Number(nextService.duration_minutes || durationMinutes));
    }
    const nextEndIso = new Date(new Date(nextStartIso).getTime() + durationMinutes * 60000).toISOString();

    const nextStaffId = normalizedStaffId !== undefined ? normalizedStaffId : appointment.staff_id;

    if (nextStaffId) {
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .eq("staff_id", nextStaffId)
        .not("status", "eq", "cancelled")
        .gt("end_time", nextStartIso)
        .lt("start_time", nextEndIso)
        .neq("id", id)
        .maybeSingle();

      if (conflict) return { success: false, error: "slot_taken" };
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.status === "completed" && patch.isPaid === undefined) updates.is_paid = true;
    if (patch.isPaid !== undefined) updates.is_paid = patch.isPaid;
    if (normalizedStaffId !== undefined) updates.staff_id = normalizedStaffId;
    if (normalizedServiceId !== undefined) {
      updates.service_id = normalizedServiceId;
      updates.service_price = nextService?.price ?? null;
    }
    if (patch.startTime !== undefined || normalizedServiceId !== undefined) {
      updates.start_time = nextStartIso;
      updates.end_time = nextEndIso;
      updates.date_key_ar = getArgentinaDateKey(nextStartIso);
    }

    const { error } = await supabase
      .from("appointments")
      .update(updates)
      .eq("id", id)
      .eq("shop_id", shopId);
    if (error) return { success: false, error: error.message };

    const nextStatus = patch.status ?? appointment.status;
    const shouldRegisterLoyaltyCut =
      nextStatus === "completed" &&
      appointment.status !== "completed" &&
      typeof appointment.customer_id === "string" &&
      appointment.customer_id.length > 0;

    if (shouldRegisterLoyaltyCut) {
      const loyaltyResult = await registerLoyaltyCut(shopId, appointment.customer_id as string);
      if (!loyaltyResult.success) return loyaltyResult;
    }

    if (nextStatus === "confirmed" && appointment.status !== "confirmed") {
      await trackProductEvent(shopId, "first_booking_confirmed", {
        actorUserId: user.id,
        metadata: { appointment_id: id },
      });
    }

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar turno" };
  }
}

export async function updateAppointmentServices(
  appointmentId: string,
  data: {
    serviceSelections: Array<{ serviceId: string; durationMinutes: number }>;
    startTime: string;
    staffId?: string | null;
    status?: string;
  },
  shopId?: string,
): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };
    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const supabase = await createServerClient();
    const { data: primary, error: primaryError } = await supabase
      .from("appointments")
      .select("id, customer_id, staff_id, start_time, end_time, status, is_paid, deposit_amount, notes, service_id, date_key_ar, recurring_group_id, loyalty_reward_applied, loyalty_discount_percent_applied")
      .eq("id", appointmentId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (primaryError) return { success: false, error: primaryError.message };
    if (!primary) return { success: false, error: "Turno no encontrado" };

    const { serviceSelections, startTime, staffId: newStaffId } = data;

    if (!serviceSelections || serviceSelections.length === 0) {
      return { success: false, error: "Seleccioná al menos un servicio" };
    }

    const parsedStart = new Date(startTime);
    if (Number.isNaN(parsedStart.getTime())) {
      return { success: false, error: "Fecha/hora inválida" };
    }

    const serviceIds = serviceSelections.map((s) => s.serviceId);
    const admin = await createAdminClient();

    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("id, duration_minutes, price, name")
      .in("id", serviceIds);

    if (servicesError) return { success: false, error: servicesError.message };
    if (!services || services.length !== serviceIds.length) {
      return { success: false, error: "Uno o más servicios no encontrados" };
    }

    for (const sel of serviceSelections) {
      if (sel.durationMinutes < 1 || sel.durationMinutes > 300) {
        return { success: false, error: "Duración inválida para un servicio. Máximo 300 min (5 hs)." };
      }
    }

    const effectiveStaffId = newStaffId !== undefined ? newStaffId : primary.staff_id;

    if (effectiveStaffId) {
      const { data: staffServiceRows } = await supabase
        .from("staff_services")
        .select("service_id")
        .eq("staff_id", effectiveStaffId);
      if (staffServiceRows && staffServiceRows.length > 0) {
        const assignedIds = new Set(staffServiceRows.map((r) => r.service_id));
        const unassigned = serviceIds.filter((id) => !assignedIds.has(id));
        if (unassigned.length > 0) {
          return { success: false, error: "El profesional no realiza uno o más servicios seleccionados" };
        }
      }
    }

    const orderedServices = serviceIds.map((id) => {
      const svc = services.find((s) => s.id === id)!;
      const sel = serviceSelections.find((s) => s.serviceId === id)!;
      return { ...svc, duration_minutes: sel.durationMinutes };
    });

    let currentStart = new Date(parsedStart);
    const rowsToInsert = orderedServices.map((svc) => {
      const currentEnd = new Date(currentStart.getTime() + svc.duration_minutes * 60000);
      const row = {
        shop_id: shopId,
        customer_id: primary.customer_id,
        staff_id: effectiveStaffId || null,
        service_id: svc.id,
        service_price: svc.price ?? null,
        start_time: currentStart.toISOString(),
        end_time: currentEnd.toISOString(),
        date_key_ar: getArgentinaDateKey(currentStart.toISOString()),
        status: data.status ?? primary.status,
        deposit_amount: primary.deposit_amount,
        is_paid: primary.is_paid,
        notes: primary.notes,
        recurring_group_id: primary.recurring_group_id,
        loyalty_reward_applied: primary.loyalty_reward_applied,
        loyalty_discount_percent_applied: primary.loyalty_discount_percent_applied,
      };
      currentStart = currentEnd;
      return row;
    });

    if (effectiveStaffId) {
      const conditions = rowsToInsert.map(
        (row) => `and(end_time.gt.${row.start_time},start_time.lt.${row.end_time})`
      );
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .eq("staff_id", effectiveStaffId)
        .not("status", "eq", "cancelled")
        .neq("id", appointmentId)
        .or(conditions.join(","))
        .limit(1);

      if (conflict && conflict.length > 0) return { success: false, error: "slot_taken" };
    }

    const siblingQuery = supabase
      .from("appointments")
      .select("id, start_time, end_time")
      .eq("shop_id", shopId)
      .eq("customer_id", primary.customer_id)
      .eq("date_key_ar", primary.date_key_ar)
      .neq("id", appointmentId)
      .not("status", "eq", "cancelled")
      .order("start_time", { ascending: true });

    if (effectiveStaffId) {
      siblingQuery.eq("staff_id", effectiveStaffId);
    }

    const { data: siblings, error: siblingsError } = await siblingQuery;

    if (siblingsError) return { success: false, error: siblingsError.message };

    const primaryStart = new Date(primary.start_time).getTime();
    const primaryEnd = new Date(primary.end_time).getTime();

    const siblingIds = (siblings || [])
      .filter((s) => {
        const sStart = new Date(s.start_time).getTime();
        const sEnd = new Date(s.end_time).getTime();
        return Math.abs(sStart - primaryEnd) <= 120000 || Math.abs(sEnd - primaryStart) <= 120000;
      })
      .map((s) => s.id);

    const allOldIds = [appointmentId, ...siblingIds];

    // Save old data before delete for potential rollback
    const { data: oldRows } = await supabase
      .from("appointments")
      .select("id, shop_id, customer_id, staff_id, service_id, service_price, start_time, end_time, date_key_ar, status, is_paid, deposit_amount, notes, recurring_group_id, loyalty_reward_applied, loyalty_discount_percent_applied")
      .in("id", allOldIds)
      .eq("shop_id", shopId);

    // Insert-first approach: no crash window between delete and insert
    const { error: insertError } = await supabase
      .from("appointments")
      .insert(rowsToInsert);

    if (insertError) {
      console.error("[updateAppointmentServices] insert failed, old data untouched:", insertError);
      return { success: false, error: insertError.message };
    }

    const { error: deleteError } = await supabase
      .from("appointments")
      .delete()
      .in("id", allOldIds)
      .eq("shop_id", shopId);

    if (deleteError) {
      console.error("[updateAppointmentServices] delete failed after insert, duplicate data may exist:", deleteError);
      return { success: false, error: "Error al eliminar los datos anteriores. Los nuevos servicios se guardaron pero pueden existir duplicados." };
    }

    const nextStatus = data.status ?? primary.status;
    const shouldRegisterLoyaltyCut =
      nextStatus === "completed" &&
      typeof primary.customer_id === "string" &&
      primary.customer_id.length > 0;

    if (shouldRegisterLoyaltyCut) {
      const loyaltyResult = await registerLoyaltyCut(shopId, primary.customer_id as string);
      if (!loyaltyResult.success) return loyaltyResult;
    }

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar servicios del turno" };
  }
}

export async function updateCustomerQuick(
  customerId: string,
  patch: { nombre?: string; email?: string; telefono?: string | null; cumpleaños?: string | null; observaciones_tecnicas?: string | null; es_vip?: boolean },
  shopId?: string,
): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    const auth = await createServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };
    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const supabase = await createServerClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.nombre !== undefined) updates.nombre = patch.nombre;
    if (patch.email !== undefined) updates.email = patch.email;
    if (patch.telefono !== undefined) updates.telefono = patch.telefono;
    if (patch.cumpleaños !== undefined) updates["cumpleaños"] = patch.cumpleaños;
    if (patch.observaciones_tecnicas !== undefined) updates.observaciones_tecnicas = patch.observaciones_tecnicas;
    if (patch.es_vip !== undefined) updates.es_vip = patch.es_vip;

    const { error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", customerId)
      .eq("shop_id", shopId);
    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/calendar", "/customers"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar cliente" };
  }
}

export async function deleteAppointment(id: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const auth = await createServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };
    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const supabase = await createServerClient();

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar turno" };
  }
}

export async function cancelRecurringSeries(groupId: string, shopId: string): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const { data: target, error: findError } = await auth
      .from("appointments")
      .select("id")
      .eq("recurring_group_id", groupId)
      .eq("shop_id", shopId)
      .limit(1);
    if (findError) return { success: false, error: findError.message };
    if (!target || target.length === 0) return { success: false, error: "No se encontraron turnos de esta serie" };

    const { error } = await auth
      .from("appointments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("recurring_group_id", groupId)
      .eq("shop_id", shopId)
      .not("status", "eq", "cancelled");

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cancelar la serie de turnos" };
  }
}

export async function redeemLoyaltyReward(appointmentId: string, shopIdOverride?: string): Promise<ActionResult<{ discountPercent: number }>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const auth = await createServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const admin = await createAdminClient();

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select("id, customer_id, service_id, is_paid, loyalty_reward_applied")
      .eq("id", appointmentId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (appointmentError || !appointment) return { success: false, error: appointmentError?.message || "Turno no encontrado" };
    if (!appointment?.customer_id) return { success: false, error: "El turno no tiene cliente asignado" };
    if (appointment.loyalty_reward_applied) return { success: false, error: "Este turno ya tiene un canje aplicado" };

    const { data: shopData, error: shopError } = await admin
      .from("shops")
      .select("loyalty_enabled, loyalty_discount_percent")
      .eq("id", shopId)
      .maybeSingle();

    if (shopError || !shopData) return { success: false, error: shopError?.message || "Local no encontrado" };
    if (!shopData?.loyalty_enabled) return { success: false, error: "La fidelizacion esta desactivada" };

    const discountPercent = Math.max(0, Math.min(100, Number(shopData.loyalty_discount_percent || 0)));

    const { data: updatedCustomer, error: customerError } = await admin
      .rpc("redeem_customer_reward", { p_customer_id: appointment.customer_id, p_shop_id: shopId });

    if (customerError) return { success: false, error: customerError.message };
    if (!updatedCustomer || !(updatedCustomer as { success: boolean }).success) {
      return { success: false, error: "El cliente no tiene canjes disponibles" };
    }

    const appointmentUpdates: Record<string, unknown> = {
      loyalty_reward_applied: true,
      loyalty_discount_percent_applied: discountPercent,
      updated_at: new Date().toISOString(),
    };
    if (discountPercent === 100) {
      appointmentUpdates.is_paid = true;
    }

    const { error: updateAppointmentError } = await admin
      .from("appointments")
      .update(appointmentUpdates)
      .eq("id", appointmentId)
      .eq("shop_id", shopId);

    if (updateAppointmentError) return { success: false, error: updateAppointmentError.message };

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", "/customers", ""]);
    return { success: true, data: { discountPercent } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al canjear fidelizacion" };
  }
}

export async function moveAppointmentGroup(
  primaryId: string,
  newStartIso: string,
  shopId?: string
): Promise<ActionResult<{ updatedIds: string[] }>> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const auth = await createServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const supabase = await createServerClient();

    const { data: primary, error: primaryError } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, customer_id, staff_id, shop_id, date_key_ar, status")
      .eq("id", primaryId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (primaryError) return { success: false, error: primaryError.message };
    if (!primary) return { success: false, error: "Turno no encontrado" };

    const parsedNewStart = new Date(newStartIso);
    if (Number.isNaN(parsedNewStart.getTime())) {
      return { success: false, error: "Fecha/hora invalida" };
    }

    const originalStart = new Date(primary.start_time);
    const offsetMs = parsedNewStart.getTime() - originalStart.getTime();

    const staffId = primary.staff_id;
    const allRows: Array<{ id: string; start_time: string; end_time: string }> = [primary];

    if (staffId && primary.customer_id) {
      const { data: siblings } = await supabase
        .from("appointments")
        .select("id, start_time, end_time")
        .eq("shop_id", shopId)
        .eq("customer_id", primary.customer_id)
        .eq("staff_id", staffId)
        .eq("date_key_ar", primary.date_key_ar)
        .neq("id", primaryId)
        .not("status", "eq", "cancelled")
        .order("start_time", { ascending: true });

      if (siblings && siblings.length > 0) {
        const combined = [primary, ...siblings].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
        const primaryIdx = combined.findIndex((r) => r.id === primaryId);

        for (let i = primaryIdx + 1; i < combined.length; i++) {
          const gap = new Date(combined[i].start_time).getTime() - new Date(combined[i - 1].end_time).getTime();
          if (Math.abs(gap) <= 120000) {
            allRows.push(combined[i]);
          } else break;
        }

        for (let i = primaryIdx - 1; i >= 0; i--) {
          const gap = new Date(combined[i + 1].start_time).getTime() - new Date(combined[i].end_time).getTime();
          if (Math.abs(gap) <= 120000) {
            allRows.unshift(combined[i]);
          } else break;
        }
      }
    }

    const updates = allRows.map((row) => {
      const newStart = new Date(new Date(row.start_time).getTime() + offsetMs);
      const newEnd = new Date(new Date(row.end_time).getTime() + offsetMs);
      return {
        id: row.id,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        date_key_ar: getArgentinaDateKey(newStart.toISOString()),
      };
    });

    if (staffId) {
      const movingIds = updates.map((u) => u.id);
      const conditions = updates.map(
        (u) => `and(end_time.gt.${u.start_time},start_time.lt.${u.end_time})`
      );
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .eq("staff_id", staffId)
        .not("status", "eq", "cancelled")
        .or(conditions.join(","));

      const realConflicts = (conflict || []).filter((c) => !movingIds.includes(c.id));
      if (realConflicts.length > 0) return { success: false, error: "slot_taken" };
    }

    // Save old data for potential rollback
    const { data: oldRows } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, date_key_ar")
      .in("id", updates.map((u) => u.id))
      .eq("shop_id", shopId);

    const updatedIds: string[] = [];
    for (const u of updates) {
      const { error } = await supabase
        .from("appointments")
        .update({
          start_time: u.start_time,
          end_time: u.end_time,
          date_key_ar: u.date_key_ar,
          updated_at: new Date().toISOString(),
        })
        .eq("id", u.id)
        .eq("shop_id", shopId);
      if (error) {
        // Rollback successful updates
        if (oldRows && oldRows.length > 0) {
          for (const old of oldRows) {
            const alreadyUpdated = updatedIds.includes(old.id);
            if (alreadyUpdated) {
              await supabase
                .from("appointments")
                .update({
                  start_time: old.start_time,
                  end_time: old.end_time,
                  date_key_ar: old.date_key_ar,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", old.id)
                .eq("shop_id", shopId);
            }
          }
        }
        return { success: false, error: error.message };
      }
      updatedIds.push(u.id);
    }

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", ""]);
    return { success: true, data: { updatedIds } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al mover turno" };
  }
}

export async function autoCompletePastAppointments(shopId: string): Promise<ActionResult<{ count: number }>> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const admin = await createAdminClient();
    const graceMs = 30 * 60 * 1000;
    const cutoff = new Date(getArgentinaNow().getTime() - graceMs).toISOString();

    const { data, error } = await admin
      .from("appointments")
      .update({ status: "completed", is_paid: true, updated_at: new Date().toISOString() })
      .eq("shop_id", shopId)
      .in("status", ["in_progress"])
      .lt("end_time", cutoff)
      .select("id")
      .limit(500);

    if (error) return { success: false, error: error.message };

    if (data && data.length > 0) {
      await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", "/customers", ""]);
    }

    return { success: true, data: { count: data?.length ?? 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al auto-completar turnos" };
  }
}
