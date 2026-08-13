"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { createArgentinaDate, getArgentinaDateKey, getArgentinaNow } from "@/lib/argentina-time";
import { sendEmailWithResend } from "@/lib/email/resend";
import type { ActionResult } from "@/lib/types";
import "server-only";

export async function createAdminClient() {
  return createServiceRoleClient();
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    dateLabel: d.toLocaleDateString("es-AR", {
      weekday: "long", day: "2-digit", month: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }),
    timeLabel: d.toLocaleTimeString("es-AR", {
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  };
}

function toGoogleCalendarUrl(title: string, startIso: string, endIso: string, location: string | undefined, details: string) {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startIso)}/${fmt(endIso)}`,
    details,
  });
  if (location) params.set("location", location);
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

function toWhatsAppUrl(phone: string | undefined, text: string) {
  if (!phone) return null;
  const clean = phone.replace(/^\+/, "").replace(/\D/g, "");
  if (clean.length < 7) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function buildAppointmentEmailHtml(params: {
  customerName: string;
  shopName: string;
  serviceName: string;
  shopAddress?: string;
  mapsUrl?: string;
  shopPhone?: string;
  instagramUrl?: string;
  whatsappUrl?: string;
  dateLabel: string;
  timeLabel: string;
  calendarUrl?: string | null;
}) {
  const mapsUrl = params.mapsUrl || (params.shopAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.shopAddress)}`
    : null);

  const locationLine = params.shopAddress
    ? `<p style="font-size:13px;color:#6b7280;margin:0 0 2px;">${params.shopAddress}</p>`
    : "";

  const mapsButton = mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;margin-top:10px;">Ver en Google Maps</a>`
    : "";

  const whatsappButton = params.whatsappUrl
    ? `<a href="${params.whatsappUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;margin:4px;">Contactar por WhatsApp</a>`
    : "";

  const instagramButton = params.instagramUrl
    ? `<a href="${params.instagramUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#ffffff;color:#262626;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #dbdbdb;margin:4px;">Instagram</a>`
    : "";

  const calendarButton = params.calendarUrl
    ? `<a href="${params.calendarUrl}" target="_blank" rel="noopener noreferrer" style="display:block;background:#ffffff;color:#1a73e8;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #1a73e8;text-align:center;margin-top:16px;">Agregar a Google Calendar</a>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#f4f4f6;">
      <div style="background:#111827;padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">Turno Confirmado</h1>
        <p style="color:#9ca3af;font-size:14px;margin:6px 0 0;">${params.shopName}</p>
      </div>
      <div style="background:#ffffff;padding:24px;">
        <p style="font-size:15px;line-height:1.5;color:#111827;margin:0 0 16px;">Hola <strong>${params.customerName}</strong>, tu turno fue reservado con exito.</p>
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="color:#6b7280;padding:3px 0;width:72px;">Servicio</td><td style="padding:3px 0;font-weight:600;">${params.serviceName}</td></tr>
            <tr><td style="color:#6b7280;padding:3px 0;">Fecha</td><td style="padding:3px 0;font-weight:600;">${params.dateLabel}</td></tr>
            <tr><td style="color:#6b7280;padding:3px 0;">Horario</td><td style="padding:3px 0;font-weight:600;">${params.timeLabel}</td></tr>
          </table>
        </div>
        ${locationLine ? `
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center;">
          ${locationLine}
          ${mapsButton}
        </div>` : ""}
        ${whatsappButton || instagramButton ? `
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center;">
          <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 8px;">Contactanos</p>
          ${whatsappButton}
          ${instagramButton}
        </div>` : ""}
        ${calendarButton}
      </div>
      <div style="background:#f4f4f6;padding:20px 24px;text-align:center;border-radius:0 0 12px 12px;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">${params.shopName}</p>
      </div>
    </div>`;
}

export async function sendAppointmentAutomationEmails(params: {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  shopAddress?: string;
  startTime: string;
  endTime: string;
  mapsUrl?: string;
  shopPhone?: string;
  instagramUrl?: string;
  whatsappUrl?: string;
}) {
  const { dateLabel, timeLabel } = formatDate(params.startTime);
  const calendarUrl = params.endTime
    ? toGoogleCalendarUrl(
        `Turno en ${params.shopName}`,
        params.startTime,
        params.endTime,
        params.shopAddress,
        `Servicio: ${params.serviceName}`
      )
    : null;

  await sendEmailWithResend({
    to: params.to,
    subject: `Confirmado! Tu turno el ${dateLabel} a las ${timeLabel}`,
    html: buildAppointmentEmailHtml({
      customerName: params.customerName,
      shopName: params.shopName,
      serviceName: params.serviceName,
      shopAddress: params.shopAddress,
      mapsUrl: params.mapsUrl,
      shopPhone: params.shopPhone,
      instagramUrl: params.instagramUrl,
      whatsappUrl: params.whatsappUrl,
      dateLabel,
      timeLabel,
      calendarUrl,
    }),
  });

  const reminderDate = new Date(new Date(params.startTime).getTime() - 3 * 60 * 60 * 1000);
  if (reminderDate <= new Date()) return;

  await sendEmailWithResend({
    to: params.to,
    subject: `Recordatorio: Tu turno es el ${dateLabel} a las ${timeLabel}`,
    scheduledAt: reminderDate.toISOString(),
    html: buildAppointmentEmailHtml({
      customerName: params.customerName,
      shopName: params.shopName,
      serviceName: params.serviceName,
      shopAddress: params.shopAddress,
      mapsUrl: params.mapsUrl,
      shopPhone: params.shopPhone,
      instagramUrl: params.instagramUrl,
      whatsappUrl: params.whatsappUrl,
      dateLabel,
      timeLabel,
      calendarUrl,
    }),
  });
}

export type AppointmentEnriched = {
  id: string;
  customer_id: string;
  staff_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  was_pending_payment?: boolean;
  deposit_amount: number | null;
  loyalty_reward_applied?: boolean;
  loyalty_discount_percent_applied?: number;
  recurring_group_id: string | null;
  notes: string | null;
  custom_service_name: string | null;
  custom_service_duration: number | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null } | null;
  staff: { user_id: string; name: string | null; email: string | null } | null;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
};

export type ServiceInfo = { id: string; name: string; price: number; duration_minutes: number };

export async function toArgentinaStartEnd(dateStr: string, timeStr: string, durationMinutes: number): Promise<{ start: Date; end: Date }> {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const start = createArgentinaDate(y, m, d, h, min);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return { start, end };
}

export type RecurringFrequency = "none" | "weekly" | "biweekly" | "monthly";

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export async function buildRecurringStarts(start: Date, frequency: RecurringFrequency, untilDate: string | null): Promise<Date[]> {
  if (frequency === "none") return [start];

  let until: Date;
  if (untilDate) {
    until = new Date(`${untilDate}T23:59:59.999-03:00`);
  } else {
    until = addDays(start, 84);
  }

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

export type StaffMemberInfo = { id: string; role: string; name: string | null; email: string | null };
export type StaffRpcRow = {
  user_id: string;
  role: string;
  name: string | null;
  nombre: string | null;
  email: string | null;
};

export async function buildStaffMapFromRpc(rows: StaffRpcRow[], staffIds: string[]) {
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

export async function fetchOperationalStaffByShopId(shopId: string): Promise<StaffRpcRow[]> {
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

export type AppointmentTableRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  was_pending_payment?: boolean;
  deposit_amount: number | null;
  loyalty_reward_applied?: boolean;
  loyalty_discount_percent_applied?: number;
  recurring_group_id: string | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null } | null;
  staff: { user_id: string; name: string | null } | null;
  services: { id: string; name: string; price: number } | null;
  custom_service_name: string | null;
};

export async function registerLoyaltyCut(shopId: string, customerId: string): Promise<ActionResult> {
  const admin = await createAdminClient();

  const { data: shopData, error: shopError } = await admin
    .from("shops")
    .select("loyalty_enabled, loyalty_cuts_required")
    .eq("id", shopId)
    .maybeSingle();

  if (shopError) return { success: false, error: shopError.message };
  if (!shopData) return { success: false, error: "Local no encontrado" };

  if (!shopData.loyalty_enabled) {
    return { success: true };
  }

  const requiredCuts = Math.max(1, Number(shopData.loyalty_cuts_required || 1));

  const { data: result, error: rpcError } = await admin
    .rpc("increment_loyalty_cut", {
      p_customer_id: customerId,
      p_shop_id: shopId,
      p_required_cuts: requiredCuts,
    });

  if (rpcError) return { success: false, error: rpcError.message };
  if (!(result as { success: boolean }).success) {
    return { success: false, error: (result as { error?: string }).error || "Error al actualizar fidelización" };
  }
  return { success: true };
}
