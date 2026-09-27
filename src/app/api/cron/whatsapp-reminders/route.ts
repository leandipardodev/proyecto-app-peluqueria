import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { getArgentinaNow, getArgentinaDateString } from "@/lib/argentina-time";
import { getWhatsAppToken } from "@/lib/dashboard/whatsapp/wa-vault";
import { deliverWaTemplateMessage, normalizePhoneToE164 } from "@/lib/dashboard/whatsapp/wa-send";
import type { WaDeliveryContext } from "@/lib/dashboard/whatsapp/wa-send";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const WINDOW_MINUTES = 30;
const minuteOffset = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60000);

type AppointmentRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string | null;
  customer_id: string | null;
  custom_service_name: string | null;
  customers: { id: string; nombre: string | null; telefono: string | null; wa_opt_out?: boolean } | null;
  services: { name: string } | null;
};

type CustomerRow = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  cumpleaños: string | null;
  wa_opt_in: boolean;
  wa_opt_out: boolean;
};

function formatLocalDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secrets = [process.env.CRON_SECRET, process.env.WHATSAPP_CRON_SECRET].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  const valid = auth?.startsWith("Bearer ") && secrets.some((s) => timingSafeEqual(auth.slice(7), s));
  if (!valid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_WHATSAPP_ENABLED !== "true") {
    return NextResponse.json({ ok: true, paused: true, shops: 0, reminders: 0, feedback: 0, birthdays: 0, errors: [] });
  }

  const admin = await createServiceRoleClient();
  const now = getArgentinaNow();
  const todayStr = getArgentinaDateString();

  const { data: shops, error: shopsError } = await admin
    .from("shops")
    .select("id, wa_waba_id, wa_phone_number_id, wa_remind_enabled, wa_feedback_enabled, wa_birthday_enabled, wa_remind_hours_before, nombre, address")
    .not("wa_phone_number_id", "is", null);

  if (shopsError) return NextResponse.json({ ok: false, error: shopsError.message }, { status: 500 });

  const summary = { reminders: 0, feedback: 0, birthdays: 0, shops: (shops || []).length };
  const errors: string[] = [];

  for (const shop of shops || []) {
    if (!shop.wa_waba_id || !shop.wa_phone_number_id) continue;

    const token = await getWhatsAppToken(shop.id);
    if (!token) continue;

    const ctx = {
      shopId: shop.id,
      wabaId: shop.wa_waba_id,
      phoneNumberId: shop.wa_phone_number_id,
      token,
      shopName: shop.nombre,
      shopAddress: shop.address || null,
    };

    try {
      if (shop.wa_remind_enabled) {
        summary.reminders += await sendRemindersForShop(admin, ctx, shop.wa_remind_hours_before, now);
      }
      if (shop.wa_feedback_enabled) {
        summary.feedback += await sendFeedbackForShop(admin, ctx, now);
      }
      if (shop.wa_birthday_enabled) {
        summary.birthdays += await sendBirthdaysForShop(admin, ctx, todayStr);
      }
    } catch (e) {
      errors.push(`${shop.id}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  return NextResponse.json({ ok: true, ...summary, errors }, { status: errors.length ? 200 : 200 });
}

async function sendRemindersForShop(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  ctx: WaDeliveryContext,
  hoursBefore: number,
  now: Date
): Promise<number> {
  const target = minuteOffset(now, hoursBefore * 60);
  const windowStart = minuteOffset(target, -WINDOW_MINUTES);
  const horizon = minuteOffset(now, (hoursBefore + 1) * 60);

  const { data: appointments } = await admin
    .from("appointments")
    .select("id, start_time, end_time, status, customer_id, custom_service_name, customers:customer_id(id, nombre, telefono), services:service_id(name)")
    .eq("shop_id", ctx.shopId)
    .is("wa_reminder_sent_at", null)
    .gte("start_time", windowStart.toISOString())
    .lte("start_time", horizon.toISOString())
    .limit(200);

  let sent = 0;
  for (const appt of (appointments || []) as AppointmentRow[]) {
    const startAt = new Date(appt.start_time);
    if (startAt < windowStart || startAt > target) continue;

    const phone = normalizePhoneToE164(appt.customers?.telefono);
    if (!phone || !appt.customers) continue;

    if (appt.customers.wa_opt_out === true) continue;

    const serviceName = appt.custom_service_name || appt.services?.name || "tu turno";
    const result = await deliverWaTemplateMessage({
      ctx,
      customerId: appt.customers.id,
      appointmentId: appt.id,
      messageType: "reminder",
      to: phone,
      bodyParameters: [
        appt.customers.nombre || "cliente",
        ctx.shopName,
        formatLocalDate(appt.start_time),
        formatLocalTime(appt.start_time),
        serviceName,
        ctx.shopAddress || "",
      ],
    });

    if (result.ok) {
      await admin
        .from("appointments")
        .update({ wa_reminder_sent_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", appt.id);
      sent++;
    }
  }
  return sent;
}

async function sendFeedbackForShop(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  ctx: WaDeliveryContext,
  now: Date
): Promise<number> {
  const windowStart = minuteOffset(now, -6 * 60);
  const windowEnd = minuteOffset(now, -10);

  const { data: appointments } = await admin
    .from("appointments")
    .select("id, status, customer_id, custom_service_name, services:service_id(name), customers:customer_id(id, nombre, telefono)")
    .eq("shop_id", ctx.shopId)
    .is("wa_feedback_sent_at", null)
    .gte("end_time", windowStart.toISOString())
    .lte("end_time", windowEnd.toISOString())
    .limit(100);

  let sent = 0;
  for (const appt of (appointments || []) as AppointmentRow[]) {
    if (!["completed", "done", "confirmed"].includes((appt.status || "completed").toLowerCase())) continue;

    const phone = normalizePhoneToE164(appt.customers?.telefono);
    if (!phone || !appt.customers) continue;
    if (appt.customers.wa_opt_out === true) continue;

    const serviceName = appt.custom_service_name || appt.services?.name || "tu turno";
    const result = await deliverWaTemplateMessage({
      ctx,
      customerId: appt.customers.id,
      appointmentId: appt.id,
      messageType: "feedback",
      to: phone,
      bodyParameters: [appt.customers.nombre || "cliente", serviceName, ctx.shopName],
    });

    if (result.ok) {
      await admin
        .from("appointments")
        .update({ wa_feedback_sent_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", appt.id);
      sent++;
    }
  }
  return sent;
}

async function sendBirthdaysForShop(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  ctx: WaDeliveryContext,
  todayStr: string
): Promise<number> {
  const todayMMDD = todayStr.slice(5);

  const { data: customers } = await admin
    .from("customers")
    .select("id, nombre, telefono, cumpleaños, wa_opt_in, wa_opt_out" as string)
    .eq("shop_id", ctx.shopId)
    .eq("wa_opt_in", true)
    .eq("wa_opt_out", false)
    .limit(200);

  const customerRows = (customers || []) as unknown as CustomerRow[];

  let sent = 0;
  const todayIsoStart = `${todayStr}T00:00:00.000-03:00`;

  for (const customer of customerRows) {
    const mmdd = customer.cumpleaños?.slice(5);
    if (!mmdd || mmdd !== todayMMDD) continue;

    const phone = normalizePhoneToE164(customer.telefono);
    if (!phone) continue;

    const { data: alreadySent } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("shop_id", ctx.shopId)
      .eq("customer_id", customer.id)
      .eq("message_type", "birthday")
      .gte("created_at", todayIsoStart)
      .maybeSingle();

    if (alreadySent) continue;

    const result = await deliverWaTemplateMessage({
      ctx,
      customerId: customer.id,
      messageType: "birthday",
      to: phone,
      bodyParameters: [customer.nombre || "cliente", ctx.shopName],
    });

    if (result.ok) sent++;
  }
  return sent;
}