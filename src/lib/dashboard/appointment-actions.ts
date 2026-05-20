"use server";

import { createServerClient } from "@/lib/supabase/server";
import { canAccessShopId, createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import { revalidateDashboardSegments } from "@/lib/dashboard/revalidate-dashboard";
import { createArgentinaDate, getArgentinaDateKey, getArgentinaNow } from "@/lib/argentina-time";
import { sendEmailWithResend } from "@/lib/email/resend";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

async function sendAppointmentAutomationEmails(params: {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  startTime: string;
  shopAddress?: string;
  replyTo?: string;
}) {
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
          <strong>Fecha y hora:</strong> ${dateLabel} a las ${timeLabel}
        </p>
      </div>
    `,
  });

  const reminderDate = new Date(new Date(params.startTime).getTime() - 3 * 60 * 60 * 1000);
  if (reminderDate <= new Date()) {
    return;
  }

  const mapsUrl = params.shopAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.shopAddress)}`
    : null;

  await sendEmailWithResend({
    to: params.to,
    subject: `⏰ Recordatorio: Tenes un turno en ${params.shopName}`,
    scheduledAt: reminderDate.toISOString(),
    replyTo: params.replyTo,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;">
        <h1 style="font-size:22px;margin:0 0 12px;">Recordatorio de turno</h1>
        <p style="font-size:15px;line-height:1.65;margin:0 0 16px;">Hola ${params.customerName}, te recordamos tu turno.</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 4px;"><strong>Peluqueria:</strong> ${params.shopName}</p>
        <p style="font-size:14px;line-height:1.6;margin:4px 0;"><strong>Servicio:</strong> ${params.serviceName}</p>
        <p style="font-size:14px;line-height:1.6;margin:4px 0;"><strong>Hora:</strong> ${dateLabel} a las ${timeLabel}</p>
        ${mapsUrl ? `<p style="font-size:14px;line-height:1.6;margin:4px 0 0;"><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Ver ubicacion en Google Maps</a></p>` : ""}
      </div>
    `,
  });
}

type AppointmentEnriched = {
  id: string;
  customer_id: string;
  staff_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  deposit_amount: number | null;
  loyalty_reward_applied?: boolean;
  loyalty_discount_percent_applied?: number;
  notes: string | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null } | null;
  staff: { user_id: string; name: string | null; email: string | null } | null;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
};

export async function fetchAppointments(startDate: string, endDate: string, shopIdOverride?: string): Promise<ActionResult<AppointmentEnriched[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("appointments")
      .select("id, customer_id, staff_id, service_id, start_time, end_time, status, is_paid, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, notes")
      .eq("shop_id", shopId)
      .gte("start_time", startDate)
      .lte("start_time", endDate)
      .order("start_time", { ascending: true });

    if (error) return { success: false, error: error.message };

    const appointments = data || [];

    const customerIds = [...new Set(appointments.map(a => a.customer_id))];
    const staffIds = [...new Set(appointments.map(a => a.staff_id))];
    const serviceIds = [...new Set(appointments.map(a => a.service_id))];

    const admin = await createAdminClient();

    const [customersData, staffRows, servicesData] = await Promise.all([
      supabase.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds),
      fetchOperationalStaffByShopId(shopId),
      admin.from("services").select("id, name, price, duration_minutes").eq("shop_id", shopId).in("id", serviceIds),
    ]);

    const customersMap = new Map((customersData.data || []).map(c => [c.id, c]));
    const staffMap = buildStaffMapFromRpc(staffRows as StaffRpcRow[], staffIds);
    const servicesMap = new Map((servicesData.data || []).map(s => [s.id, s]));

    const enriched = appointments.map(apt => ({
      ...apt,
      customers: customersMap.get(apt.customer_id) || null,
      staff: staffMap.get(apt.staff_id) || null,
      services: servicesMap.get(apt.service_id) || null,
    })) as AppointmentEnriched[];

    return { success: true, data: enriched };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
  }
}

type ServiceInfo = { id: string; name: string; price: number; duration_minutes: number };

export async function fetchActiveServices(shopIdOverride?: string): Promise<ActionResult<ServiceInfo[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes")
      .eq("shop_id", shopId)
      .order("name", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener servicios" };
  }
}

function toArgentinaStartEnd(dateStr: string, timeStr: string, durationMinutes: number): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const start = createArgentinaDate(y, m, d, h, min);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return { start, end };
}

type RecurringFrequency = "none" | "weekly" | "biweekly" | "monthly";

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function buildRecurringStarts(start: Date, frequency: RecurringFrequency, untilDate: string | null): Date[] {
  if (frequency === "none" || !untilDate) return [start];
  const until = new Date(`${untilDate}T23:59:59.999-03:00`);
  if (Number.isNaN(until.getTime()) || until <= start) return [start];

  const starts: Date[] = [start];
  let current = start;
  while (starts.length < 60) {
    current =
      frequency === "weekly"
        ? addDays(current, 7)
        : frequency === "biweekly"
          ? addDays(current, 14)
          : addMonths(current, 1);
    if (current > until) break;
    starts.push(current);
  }
  return starts;
}

type StaffMemberInfo = { id: string; role: string; name: string | null; email: string | null };
type StaffRpcRow = {
  user_id: string;
  role: string;
  name: string | null;
  nombre: string | null;
  email: string | null;
};

function buildStaffMapFromRpc(rows: StaffRpcRow[], staffIds: string[]) {
  const allowedIds = new Set(staffIds.filter(Boolean));
  return new Map(
    rows
      .filter((row) => (row.role === "owner" || row.role === "staff") && allowedIds.has(row.user_id))
      .map((row) => [
        row.user_id,
        { user_id: row.user_id, name: row.name ?? row.nombre ?? null, email: row.email ?? null },
      ])
  );
}

async function fetchOperationalStaffByShopId(shopId: string): Promise<StaffRpcRow[]> {
  const admin = await createAdminClient();
  const { data: memberships, error: membershipsError } = await admin
    .from("shop_memberships")
    .select("user_id, role")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .in("role", ["owner", "staff", "admin"]);

  if (membershipsError) throw new Error(membershipsError.message);

  const userIds = (memberships || []).map((m) => m.user_id).filter(Boolean);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await admin
    .from("user_profiles")
    .select("user_id, name, email")
    .in("user_id", userIds);

  if (profilesError) throw new Error(profilesError.message);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

  return (memberships || []).map((m) => {
    const profile = profileMap.get(m.user_id);
    return {
      user_id: m.user_id,
      role: m.role,
      name: profile?.name || null,
      nombre: profile?.name || null,
      email: profile?.email || null,
    };
  });
}

export async function fetchStaffMembers(shopIdOverride?: string): Promise<ActionResult<StaffMemberInfo[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }
    const rows = await fetchOperationalStaffByShopId(shopId);

    return {
      success: true,
      data: rows
        .filter((s) => s.role === "owner" || s.role === "staff" || s.role === "admin")
        .map((s) => ({ id: s.user_id, role: s.role, name: s.name ?? s.nombre ?? null, email: s.email })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener personal" };
  }
}

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
    const serviceId = formData.get("service_id") as string;
    const startDate = formData.get("start_date") as string;
    const startTime = formData.get("start_time") as string;
    const recurringFrequency = ((formData.get("recurring_frequency") as string) || "none") as RecurringFrequency;
    const recurringUntil = ((formData.get("recurring_until") as string) || "").trim() || null;
    const notes = formData.get("notes") as string;
    const depositAmountRaw = (formData.get("deposit_amount") as string) || "";
    const depositAmount = depositAmountRaw ? Number(depositAmountRaw) : null;

    if (!customerId || !serviceId || !startDate || !startTime) {
      return { success: false, error: "Todos los campos obligatorios deben completarse" };
    }
    if (depositAmount !== null && (Number.isNaN(depositAmount) || depositAmount < 0)) {
      return { success: false, error: "La seña debe ser un monto válido" };
    }

    const supabase = await createServerClient();

    const { data: service } = await supabase
      .from("services")
      .select("duration_minutes")
      .eq("id", serviceId)
      .single();

    if (!service) return { success: false, error: "Servicio no encontrado" };

    const { start } = toArgentinaStartEnd(startDate, startTime, service.duration_minutes);
    const recurringStarts = buildRecurringStarts(start, recurringFrequency, recurringUntil);

    const rowsToInsert = recurringStarts.map((startAt) => {
      const endAt = new Date(startAt.getTime() + service.duration_minutes * 60000);
      const startIso = startAt.toISOString();
      return {
        shop_id: shopId,
        customer_id: customerId,
        staff_id: staffId || null,
        service_id: serviceId,
        start_time: startIso,
        end_time: endAt.toISOString(),
        date_key_ar: getArgentinaDateKey(startIso),
        status: "scheduled",
        deposit_amount: depositAmount,
        is_paid: depositAmount !== null && depositAmount > 0,
        notes: notes || null,
      };
    });

    if (staffId) {
      for (const row of rowsToInsert) {
        const { data: conflict } = await supabase
          .from("appointments")
          .select("id")
          .eq("shop_id", shopId)
          .eq("staff_id", staffId)
          .not("status", "eq", "cancelled")
          .gt("end_time", row.start_time)
          .lt("start_time", row.end_time)
          .maybeSingle();
        if (conflict) return { success: false, error: "slot_taken" };
      }
    }

    const { error } = await supabase.from("appointments").insert(rowsToInsert);

    if (error) return { success: false, error: error.message };

    try {
      const admin = await createAdminClient();
      const [{ data: customer }, { data: serviceData }, { data: shopData }] = await Promise.all([
        supabase.from("customers").select("nombre, email").eq("id", customerId).maybeSingle(),
        supabase.from("services").select("name").eq("id", serviceId).maybeSingle(),
        admin.from("shops").select("nombre, email, address").eq("id", shopId).maybeSingle(),
      ]);

      const emailTo = customer?.email?.trim();
      if (emailTo) {
        await Promise.allSettled(
          rowsToInsert.map((row) =>
            sendAppointmentAutomationEmails({
              to: emailTo,
              customerName: customer?.nombre || "Cliente",
              shopName: (shopData as { nombre?: string | null } | null)?.nombre || "Klip",
              serviceName: serviceData?.name || "Servicio",
              startTime: row.start_time,
              shopAddress: (shopData as { address?: string | null } | null)?.address || undefined,
              replyTo:
                (shopData as { email?: string | null } | null)?.email && (shopData as { email?: string | null }).email?.includes("@")
                  ? (shopData as { email?: string | null }).email || undefined
                  : undefined,
            })
          )
        );
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
    const serviceId = formData.get("service_id") as string;
    const startDate = formData.get("start_date") as string;
    const startTime = formData.get("start_time") as string;
    const recurringFrequency = ((formData.get("recurring_frequency") as string) || "none") as RecurringFrequency;
    const recurringUntil = ((formData.get("recurring_until") as string) || "").trim() || null;
    const notes = formData.get("notes") as string;
    const depositAmountRaw = (formData.get("deposit_amount") as string) || "";
    const depositAmount = depositAmountRaw ? Number(depositAmountRaw) : null;

    if (!customerName || !customerEmail || !serviceId || !startDate || !startTime) {
      return { success: false, error: "Nombre, email, servicio, fecha y hora son obligatorios" };
    }
    if (depositAmount !== null && (Number.isNaN(depositAmount) || depositAmount < 0)) {
      return { success: false, error: "La seña debe ser un monto válido" };
    }

    const supabase = await createServerClient();

    const { data: customerRow, error: customerInsertError } = await supabase
      .from("customers")
      .insert({
        shop_id: shopId,
        nombre: customerName,
        email: customerEmail,
        telefono: customerPhone || null,
      })
      .select("id")
      .single();

    if (customerInsertError || !customerRow?.id) {
      return { success: false, error: customerInsertError?.message || "No se pudo crear el cliente" };
    }

    const { data: service } = await supabase
      .from("services")
      .select("duration_minutes")
      .eq("id", serviceId)
      .single();

    if (!service) return { success: false, error: "Servicio no encontrado" };

    const { start } = toArgentinaStartEnd(startDate, startTime, service.duration_minutes);
    const recurringStarts = buildRecurringStarts(start, recurringFrequency, recurringUntil);

    const rowsToInsert = recurringStarts.map((startAt) => {
      const endAt = new Date(startAt.getTime() + service.duration_minutes * 60000);
      const startIso = startAt.toISOString();
      return {
        shop_id: shopId,
        customer_id: customerRow.id,
        staff_id: staffId || null,
        service_id: serviceId,
        start_time: startIso,
        end_time: endAt.toISOString(),
        date_key_ar: getArgentinaDateKey(startIso),
        status: "scheduled",
        deposit_amount: depositAmount,
        is_paid: depositAmount !== null && depositAmount > 0,
        notes: notes || null,
      };
    });

    if (staffId) {
      for (const row of rowsToInsert) {
        const { data: conflict } = await supabase
          .from("appointments")
          .select("id")
          .eq("shop_id", shopId)
          .eq("staff_id", staffId)
          .not("status", "eq", "cancelled")
          .gt("end_time", row.start_time)
          .lt("start_time", row.end_time)
          .maybeSingle();

        if (conflict) return { success: false, error: "slot_taken" };
      }
    }

    const { error: aptError } = await supabase.from("appointments").insert(rowsToInsert);

    if (aptError) return { success: false, error: aptError.message };

    try {
      const admin = await createAdminClient();
      const [{ data: serviceData }, { data: shopData }] = await Promise.all([
        supabase.from("services").select("name").eq("id", serviceId).maybeSingle(),
        admin.from("shops").select("nombre, email, address").eq("id", shopId).maybeSingle(),
      ]);

      const emailTo = customerEmail.trim();
      if (emailTo) {
        await Promise.allSettled(
          rowsToInsert.map((row) =>
            sendAppointmentAutomationEmails({
              to: emailTo,
              customerName,
              shopName: (shopData as { nombre?: string | null } | null)?.nombre || "Klip",
              serviceName: serviceData?.name || "Servicio",
              startTime: row.start_time,
              shopAddress: (shopData as { address?: string | null } | null)?.address || undefined,
              replyTo:
                (shopData as { email?: string | null } | null)?.email && (shopData as { email?: string | null }).email?.includes("@")
                  ? (shopData as { email?: string | null }).email || undefined
                  : undefined,
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

type AppointmentTableRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  deposit_amount: number | null;
  loyalty_reward_applied?: boolean;
  loyalty_discount_percent_applied?: number;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null } | null;
  staff: { user_id: string; name: string | null } | null;
  services: { id: string; name: string; price: number } | null;
};

export async function fetchAllAppointmentsForTable(
  shopIdOverride?: string,
  options?: { limit?: number; upcomingOnly?: boolean }
): Promise<ActionResult<AppointmentTableRow[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const limit = options?.limit;
    const upcomingOnly = options?.upcomingOnly === true;
    let appointmentsQuery = admin
      .from("appointments")
      .select("id, start_time, end_time, status, is_paid, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, customer_id, staff_id, service_id")
      .eq("shop_id", shopId)
      .order("start_time", { ascending: true });

    if (upcomingOnly) {
      appointmentsQuery = appointmentsQuery.gte("start_time", getArgentinaNow().toISOString());
    }

    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      appointmentsQuery = appointmentsQuery.limit(Math.floor(limit));
    }

    const { data: appointments, error: aptError } = await appointmentsQuery;

    if (aptError) {
      console.error("[fetchAllAppointmentsForTable] appointments error:", aptError);
      return { success: false, error: aptError.message };
    }

    const customerIds = [...new Set((appointments || []).map(a => a.customer_id).filter(Boolean))];
    const staffIds = [...new Set((appointments || []).map(a => a.staff_id).filter(Boolean))];
    const serviceIds = [...new Set((appointments || []).map(a => a.service_id).filter(Boolean))];

    const [customersRes, staffRows, servicesRes] = await Promise.all([
      customerIds.length > 0
        ? admin.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds)
        : { data: [], error: null },
      staffIds.length > 0 ? fetchOperationalStaffByShopId(shopId) : Promise.resolve([] as StaffRpcRow[]),
      serviceIds.length > 0
        ? admin.from("services").select("id, name, price").in("id", serviceIds)
        : { data: [], error: null },
    ]);

    const customerRows = (customersRes.data || []) as Array<{ id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null }>;
    const customerMap = new Map(customerRows.map((c) => [c.id, c]));
    const staffMap = new Map(
      Array.from(buildStaffMapFromRpc(staffRows as StaffRpcRow[], staffIds)).map(([userId, row]) => [
        userId,
        { user_id: row.user_id, name: row.name },
      ])
    );
    const serviceRows = (servicesRes.data || []) as Array<{ id: string; name: string; price: number }>;
    const serviceMap = new Map(serviceRows.map((s) => [s.id, s]));

    const rows = (appointments || []).map(apt => ({
      id: apt.id,
      start_time: apt.start_time,
      end_time: apt.end_time,
      status: apt.status,
      is_paid: apt.is_paid,
      deposit_amount: apt.deposit_amount,
      loyalty_reward_applied: apt.loyalty_reward_applied,
      loyalty_discount_percent_applied: apt.loyalty_discount_percent_applied,
      customers: customerMap.get(apt.customer_id) || null,
      staff: staffMap.get(apt.staff_id) || null,
      services: serviceMap.get(apt.service_id) || null,
    }));

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
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
  patch: { status?: string; isPaid?: boolean; staffId?: string | null },
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
      .select("id, start_time, end_time, status, customer_id")
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (aptError) return { success: false, error: aptError.message };
    if (!appointment) return { success: false, error: "Turno no encontrado" };

    const normalizedStaffId = patch.staffId !== undefined
      ? (patch.staffId && patch.staffId.trim().length > 0 ? patch.staffId.trim() : null)
      : undefined;

    if (normalizedStaffId !== undefined && normalizedStaffId) {
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

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.isPaid !== undefined) updates.is_paid = patch.isPaid;
    if (normalizedStaffId !== undefined) updates.staff_id = normalizedStaffId;

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

    await revalidateDashboardSegments(shopId, ["/calendar", "/appointments", ""]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar turno" };
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

async function registerLoyaltyCut(shopId: string, customerId: string): Promise<ActionResult> {
  const admin = await createAdminClient();

  const { data: shopData, error: shopError } = await admin
    .from("shops")
    .select("loyalty_enabled, loyalty_cuts_required")
    .eq("id", shopId)
    .single();

  if (shopError) return { success: false, error: shopError.message };

  if (!shopData?.loyalty_enabled) {
    return { success: true };
  }

  const requiredCuts = Math.max(1, Number(shopData.loyalty_cuts_required || 1));

  const { data: customerData, error: customerError } = await admin
    .from("customers")
    .select("loyalty_cuts_count, loyalty_rewards_available")
    .eq("id", customerId)
    .eq("shop_id", shopId)
    .single();

  if (customerError) return { success: false, error: customerError.message };

  const currentCuts = Math.max(0, Number(customerData?.loyalty_cuts_count || 0));
  const currentRewards = Math.max(0, Number(customerData?.loyalty_rewards_available || 0));
  const nextCutsRaw = currentCuts + 1;
  const rewardsToAdd = Math.floor(nextCutsRaw / requiredCuts);
  const nextCuts = nextCutsRaw % requiredCuts;

  const { error: updateCustomerError } = await admin
    .from("customers")
    .update({
      loyalty_cuts_count: nextCuts,
      loyalty_rewards_available: currentRewards + rewardsToAdd,
    })
    .eq("id", customerId)
    .eq("shop_id", shopId);

  if (updateCustomerError) return { success: false, error: updateCustomerError.message };
  return { success: true };
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
      .single();

    if (appointmentError) return { success: false, error: appointmentError.message };
    if (!appointment?.customer_id) return { success: false, error: "El turno no tiene cliente asignado" };
    if (appointment.loyalty_reward_applied) return { success: false, error: "Este turno ya tiene un canje aplicado" };

    const { data: shopData, error: shopError } = await admin
      .from("shops")
      .select("loyalty_enabled, loyalty_discount_percent")
      .eq("id", shopId)
      .single();

    if (shopError) return { success: false, error: shopError.message };
    if (!shopData?.loyalty_enabled) return { success: false, error: "La fidelizacion esta desactivada" };

    const discountPercent = Math.max(0, Math.min(100, Number(shopData.loyalty_discount_percent || 0)));

    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("loyalty_rewards_available")
      .eq("id", appointment.customer_id)
      .eq("shop_id", shopId)
      .single();

    if (customerError) return { success: false, error: customerError.message };

    const rewardsAvailable = Math.max(0, Number(customer?.loyalty_rewards_available || 0));
    if (rewardsAvailable <= 0) return { success: false, error: "El cliente no tiene canjes disponibles" };

    const { error: updateCustomerError } = await admin
      .from("customers")
      .update({ loyalty_rewards_available: rewardsAvailable - 1 })
      .eq("id", appointment.customer_id)
      .eq("shop_id", shopId);

    if (updateCustomerError) return { success: false, error: updateCustomerError.message };

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
