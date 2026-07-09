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

export async function sendAppointmentAutomationEmails(params: {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  startTime: string;
  shopAddress?: string;
  replyTo?: string;
  mapsUrl?: string;
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

  const mapsUrl = params.mapsUrl || (params.shopAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.shopAddress)}`
    : null);
  const locationLine = params.shopAddress
    ? `<p style="font-size:14px;line-height:1.6;margin:4px 0 14px;"><strong>Direccion:</strong> ${params.shopAddress}</p>`
    : "";
  const mapsButton = mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0071E3;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-size:13px;font-weight:600;">Ver ubicacion en Google Maps</a>`
    : "";

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
        ${locationLine}
        ${mapsButton}
        <p style="font-size:12px;color:#6b7280;margin-top:18px;">Klip - no-reply@send.klip.com.ar</p>
      </div>
    `,
  });

  const reminderDate = new Date(new Date(params.startTime).getTime() - 3 * 60 * 60 * 1000);
  if (reminderDate <= new Date()) {
    return;
  }

  await sendEmailWithResend({
    to: params.to,
    subject: `Recordatorio: Tu turno es el ${dateLabel} a las ${timeLabel}`,
    scheduledAt: reminderDate.toISOString(),
    replyTo: params.replyTo,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:22px;margin:0 0 12px;">Recordatorio de turno</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hola ${params.customerName}, te recordamos que tenes un turno proximamente.</p>
        <p style="font-size:15px;line-height:1.6;margin:0;">
          <strong>Local:</strong> ${params.shopName}<br/>
          <strong>Servicio:</strong> ${params.serviceName}<br/>
          <strong>Fecha y hora:</strong> ${dateLabel} a las ${timeLabel}
        </p>
        ${locationLine}
        ${mapsButton}
        <p style="font-size:12px;color:#6b7280;margin-top:18px;">Klip - no-reply@send.klip.com.ar</p>
      </div>
    `,
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
