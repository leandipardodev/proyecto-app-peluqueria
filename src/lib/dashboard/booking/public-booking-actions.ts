"use server";


import {
  getArgentinaDateKey,
  getArgentinaDateString,
  getArgentinaDayBounds,
  getArgentinaMinutesSinceMidnight,
} from "@/lib/argentina-time";
import { computeSlotsForDay } from "./slots";
import type { DateOverrideEntry, Slot, StaffScheduleEntry } from "./slots";
import { MercadoPagoConfig, Preference } from "mercadopago";
import type { ActionResult } from "@/lib/types";
import { sendAppointmentConfirmationEmail, scheduleAppointmentReminderEmail } from "@/lib/email/booking-emails";
import { createRateLimiter } from "@/lib/rate-limiter";
import { headers } from "next/headers";
import { fetchShopDateOverrides } from "@/lib/dashboard/shop/business-actions";
import { createStoreOrderRecord, type StoreCheckoutItem } from "@/lib/dashboard/store/public-store-actions";
import { restoreOrderStock } from "@/lib/dashboard/store/stock";
import "server-only";
import { createAdminClient } from "../appointments/shared";
import { completedBookingCache } from "@/lib/booking-cache";

const slotsLimiter = createRateLimiter({ intervalMs: 60_000, maxRequests: 30 });

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Find or create a customer for (shop_id, telefono).
 * Tolerant of concurrent duplicate inserts (unique_customer_phone_per_shop):
 * if the INSERT fails with 23505 we re-read the existing row and update it instead.
 * For authenticated users the customer row keyed by user id is preferred, falling
 * back to the phone-matched row when a phone uniqueness conflict arises.
 */
async function resolveCustomer(
  admin: AdminClient,
  input: {
    shopId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string | null;
    authenticatedUserId?: string;
  }
): Promise<ActionResult<{ customerId: string }>> {
  const { shopId, customerName, customerPhone, customerEmail, authenticatedUserId } = input;

  const selectByPhone = () =>
    admin
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("telefono", customerPhone)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  const updateCustomer = (id: string, extra?: { user_id?: string }) =>
    admin
      .from("customers")
      .update({
        nombre: customerName,
        email: customerEmail ?? null,
        ...extra,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

  if (authenticatedUserId) {
    const { data: created, error } = await admin
      .from("customers")
      .upsert(
        {
          id: authenticatedUserId,
          user_id: authenticatedUserId,
          shop_id: shopId,
          nombre: customerName,
          email: customerEmail ?? null,
          telefono: customerPhone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id")
      .maybeSingle();

    if (!error && created?.id) {
      return { success: true, data: { customerId: created.id } };
    }

    if (error && error.code !== "23505") {
      return { success: false, error: error.message };
    }

    // Phone uniqueness conflict (e.g. an anonymous booking used this phone before):
    // reuse the existing phone-matched customer and link it to the logged-in user.
    const existing = await selectByPhone();
    if (existing.data) {
      const { error: updateError } = await updateCustomer(existing.data.id, { user_id: authenticatedUserId });
      if (updateError) return { success: false, error: updateError.message };
      return { success: true, data: { customerId: existing.data.id } };
    }

    if (error) return { success: false, error: error.message };
    return { success: true, data: { customerId: authenticatedUserId } };
  }

  const existing = await selectByPhone();
  if (existing.data) {
    const { error: updateError } = await updateCustomer(existing.data.id);
    if (updateError) return { success: false, error: updateError.message };
    return { success: true, data: { customerId: existing.data.id } };
  }

  const { data: created, error: insertError } = await admin
    .from("customers")
    .insert({
      user_id: null,
      shop_id: shopId,
      nombre: customerName,
      telefono: customerPhone,
      email: customerEmail ?? null,
    })
    .select("id")
    .single();

  if (insertError) {
    // Race: another request created this customer between our SELECT and INSERT.
    if (insertError.code === "23505") {
      const retry = await selectByPhone();
      if (retry.data) {
        const { error: updateError } = await updateCustomer(retry.data.id);
        if (updateError) return { success: false, error: updateError.message };
        return { success: true, data: { customerId: retry.data.id } };
      }
    }
    return { success: false, error: insertError.message };
  }

  return { success: true, data: { customerId: created.id } };
}

type ComboService = { id: string; name: string; duration_minutes: number; price: number; pay_at_shop: boolean };
type ComboRow = { id: string; name: string; description: string | null; price: number; total_duration: number; duration_minutes: number | null; services: ComboService[] };

export async function fetchPublicCombos(shopId: string): Promise<ActionResult<ComboRow[]>> {
  try {
    const admin = await createAdminClient();

    const { data: combos, error } = await admin
      .from("combos")
      .select("id, name, description, price, duration_minutes")
      .eq("shop_id", shopId)
      .eq("active", true);

    if (error) return { success: false, error: error.message };
    if (!combos || combos.length === 0) return { success: true, data: [] };

    const comboIds = combos.map((c) => c.id);
    const { data: links } = await admin
      .from("combo_services")
      .select("combo_id, service_id")
      .in("combo_id", comboIds);

    const allServiceIds = [...new Set((links || []).map((l) => l.service_id))];
    const serviceById = new Map<string, ComboService>();

    if (allServiceIds.length > 0) {
      const { data: servicesData } = await admin
        .from("services")
        .select("id, name, duration_minutes, price, pay_at_shop")
        .in("id", allServiceIds);
      for (const s of servicesData || []) {
        serviceById.set(s.id, s as ComboService);
      }
    }

    const linkMap = new Map<string, ComboService[]>();
    for (const link of links || []) {
      const list = linkMap.get(link.combo_id) || [];
      const svc = serviceById.get(link.service_id);
      if (svc) list.push(svc);
      linkMap.set(link.combo_id, list);
    }

    const result: ComboRow[] = combos.map((combo) => {
      const services = linkMap.get(combo.id) || [];
      const total_duration = services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      return {
        id: combo.id,
        name: combo.name,
        description: combo.description,
        price: Number(combo.price) || 0,
        total_duration,
        duration_minutes: combo.duration_minutes ?? null,
        services,
      };
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener combos" };
  }
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

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToHHmm(m: number): string {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
function getWeekdayFromDateString(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

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

const PENDING_PAYMENT_HOLD_MINUTES = 10;

function shouldBlockSlot(status: string | null | undefined, createdAt: string | null | undefined): boolean {
  if (status === "no_show") return false;
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
  staffIds?: string[],
  serviceId?: string
): Promise<ActionResult<Slot[]>> {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || "unknown";
    const rateCheck = await slotsLimiter.check(`fetch-slots:${ip}:${shopId}`);
    if (!rateCheck.allowed) {
      return { success: true, data: [] };
    }

    const admin = await createAdminClient();

    const { data: shop } = await admin
      .from("shops")
      .select("business_hours")
      .eq("id", shopId)
      .maybeSingle();

    const dbHours = normalizeHours(shop?.business_hours);
    const dayIndex = getWeekdayFromDateString(date);
    const dayName = DAY_KEYS[dayIndex];

    const resolved = resolveDayHours(dbHours, dayIndex);
    let shopDayConfig = (resolved || DEFAULT_WEEK_HOURS[dayName])!;
    if (!shopDayConfig.open) return { success: true, data: [] };

    const [shopSh, shopSm] = shopDayConfig.start.split(":").map(Number);
    let shopOpenMinutes = shopSh * 60 + shopSm;
    const [shopEh, shopEm] = shopDayConfig.end.split(":").map(Number);
    let shopCloseMinutes = shopEh * 60 + shopEm;
    if (shopOpenMinutes >= shopCloseMinutes) return { success: true, data: [] };

    const { data: allStaff } = await admin
      .from("shop_memberships")
      .select("user_id")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .in("role", ["owner", "staff"]);

    const allStaffIds = (allStaff || []).map((s) => s.user_id);
    if (allStaffIds.length === 0) return { success: true, data: [] };

    // Find all staff who can perform the selected service
    let serviceCapableStaffIds: string[] = allStaffIds;
    if (serviceId) {
      const { data: serviceStaffRows } = await admin
        .from("staff_services")
        .select("staff_id")
        .eq("service_id", serviceId);
      const ids = (serviceStaffRows || []).map((r) => r.staff_id).filter(Boolean);
      if (ids.length > 0) serviceCapableStaffIds = ids;
    }

    // Narrow to selected staff if provided
    let poolIds = serviceCapableStaffIds;
    if (staffIds && staffIds.length > 0) {
      poolIds = staffIds.filter(id => serviceCapableStaffIds.includes(id));
    }
    if (poolIds.length === 0) return { success: true, data: [] };

    const staffIdsToQuery = poolIds;
    const { data: staffSchedules } = await admin
      .from("staff_schedules")
      .select("staff_id, is_active, start_time, end_time, break_start, break_end")
      .in("staff_id", staffIdsToQuery)
      .eq("day_of_week", dayIndex);

    const scheduleMap = new Map<string, StaffScheduleEntry>();
    for (const s of staffSchedules || []) {
      scheduleMap.set(s.staff_id, s);
    }

    // Fetch date overrides for this date
    const overrideResult = await fetchShopDateOverrides(shopId, date, date);
    const overrides = overrideResult.success ? (overrideResult.data || []) : [];
    const shopOverride = overrides.find(o => o.staff_id === null);

    // Build staff override map for fast lookup
    const staffOverrideMap = new Map<string, DateOverrideEntry>();
    for (const o of overrides) {
      if (o.staff_id) staffOverrideMap.set(o.staff_id, o);
    }

    if (shopOverride) {
      if (shopOverride.is_closed) {
        return { success: true, data: [] };
      }
      if (shopOverride.start_time && shopOverride.end_time) {
        const overrideStart = hhmmToMinutes(shopOverride.start_time);
        const overrideEnd = hhmmToMinutes(shopOverride.end_time);
        shopOpenMinutes = Math.max(shopOpenMinutes, overrideStart);
        shopCloseMinutes = Math.min(shopCloseMinutes, overrideEnd);
        if (shopOpenMinutes >= shopCloseMinutes) {
          return { success: true, data: [] };
        }
      }
      // Override break from shop override if provided
      if (shopOverride.break_start && shopOverride.break_end) {
        const bs = hhmmToMinutes(shopOverride.break_start);
        const be = hhmmToMinutes(shopOverride.break_end);
        if (shopOpenMinutes < bs && bs < be && be < shopCloseMinutes) {
          shopDayConfig = {
            ...shopDayConfig,
            break_start: shopOverride.break_start,
            break_end: shopOverride.break_end,
          };
        }
      }
    }

    const { start: dayStart, end: dayEnd } = getArgentinaDayBounds(date);
    const { data: appointmentsRaw } = await admin
      .from("appointments")
      .select("start_time, end_time, staff_id, status, created_at")
      .eq("shop_id", shopId)
      .lt("start_time", dayEnd.toISOString())
      .gt("end_time", dayStart.toISOString())
      .not("status", "in", "('cancelled','no_show')");

    const appointments = (appointmentsRaw || []).filter((apt) =>
      shouldBlockSlot(apt.status as string | null | undefined, apt.created_at as string | null | undefined)
    );

    const { data: pendingBookings } = await admin
      .from("pending_bookings")
      .select("start_time, end_time, staff_id")
      .eq("shop_id", shopId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .lt("start_time", dayEnd.toISOString())
      .gt("end_time", dayStart.toISOString());

    const allBlocks = [
      ...appointments,
      ...(pendingBookings || []).map((pb) => ({
        start_time: pb.start_time,
        end_time: pb.end_time,
        staff_id: pb.staff_id,
      })),
    ];

    const slots = computeSlotsForDay({
      date,
      serviceDuration,
      shopDayConfig,
      shopOpenMinutes,
      shopCloseMinutes,
      poolIds,
      scheduleMap,
      staffOverrideMap,
      allBlocks,
    });

    return { success: true, data: slots };
  } catch (e) {
    console.error("[fetchPublicAvailableSlots] error:", e);
    return { success: false, error: "Error al calcular disponibilidad" };
  }
}

async function resolveShopDayConfig(admin: Awaited<ReturnType<typeof createAdminClient>>, shopId: string, dayIndex: number, businessHours?: unknown): Promise<{ open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null }> {
  const rawHours = businessHours
    ? businessHours
    : (await admin.from("shops").select("business_hours").eq("id", shopId).maybeSingle()).data?.business_hours;
  const normalizedHours = normalizeHours(rawHours);
  const dayName = DAY_KEYS[dayIndex];
  const resolved = resolveDayHours(normalizedHours, dayIndex);
  return resolved || DEFAULT_WEEK_HOURS[dayName] || { open: false, start: "09:00", end: "20:00" };
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
  skipRepeatCache?: boolean;
  startTime: string;
  endTime: string;
}): Promise<ActionResult<{ customerId: string; appointmentId: string }>> {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || "unknown";
    const ipKey = `completed-booking:${ip}:${data.shopId}`;
    const isRepeatBooking = completedBookingCache.has(ipKey);

    if (isRepeatBooking && !data.authenticatedUserId) {
      return { success: false, error: "login_required" };
    }

    const admin = await createAdminClient();

    const startDate = new Date(data.startTime);
    const endDate = new Date(data.endTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return { success: false, error: "Horario invalido" };
    }

    if (data.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.customerEmail)) {
      return { success: false, error: "Email inválido" };
    }
    const cleanPhone = data.customerPhone.replace(/\D/g, "");
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return { success: false, error: "Teléfono inválido" };
    }

    const customerName = data.customerName.trim();
    if (customerName.length < 2 || customerName.length > 100) {
      return { success: false, error: "Nombre inválido" };
    }

    const bookingDate = getArgentinaDateKey(data.startTime);
    const todayAr = getArgentinaDateString();
    if (bookingDate < todayAr) {
      return { success: false, error: "No se puede reservar en una fecha pasada" };
    }
    if (bookingDate === todayAr) {
      const nowMinutes = getArgentinaMinutesSinceMidnight(new Date());
      const bookingMinutes = getArgentinaMinutesSinceMidnight(data.startTime);
      if (bookingMinutes < nowMinutes) {
        return { success: false, error: "No se puede reservar en un horario pasado" };
      }
    }

    const dayIndex = getWeekdayFromDateString(bookingDate);
    const startMinutes = getArgentinaMinutesSinceMidnight(data.startTime);
    const endMinutes = getArgentinaMinutesSinceMidnight(data.endTime);

    // Fetch shop hours once for all resolveShopDayConfig calls in this function
    const { data: shopHoursRow } = await admin
      .from("shops")
      .select("business_hours")
      .eq("id", data.shopId)
      .maybeSingle();
    const businessHours = shopHoursRow?.business_hours;

    // Resolve effective schedule: staff schedule takes priority, fallback to shop hours
    let effectiveDayConfig: { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null };

    if (data.staffId) {
      const { data: staffSchedule } = await admin
        .from("staff_schedules")
        .select("is_active, start_time, end_time, break_start, break_end")
        .eq("staff_id", data.staffId)
        .eq("day_of_week", dayIndex)
        .maybeSingle();

      if (staffSchedule) {
        if (!staffSchedule.is_active) {
          return { success: false, error: "El profesional no trabaja este dia" };
        }
        effectiveDayConfig = {
          open: true,
          start: staffSchedule.start_time.slice(0, 5),
          end: staffSchedule.end_time.slice(0, 5),
          break_start: staffSchedule.break_start?.slice(0, 5) ?? null,
          break_end: staffSchedule.break_end?.slice(0, 5) ?? null,
        };
        // Intersect staff schedule with shop hours
          const shopConfig = await resolveShopDayConfig(admin, data.shopId, dayIndex, businessHours);
          if (shopConfig.open) {
            const interStart = Math.max(hhmmToMinutes(effectiveDayConfig.start), hhmmToMinutes(shopConfig.start));
            const interEnd = Math.min(hhmmToMinutes(effectiveDayConfig.end), hhmmToMinutes(shopConfig.end));
            effectiveDayConfig.start = minutesToHHmm(interStart);
            effectiveDayConfig.end = minutesToHHmm(interEnd);
          }
        } else {
          effectiveDayConfig = await resolveShopDayConfig(admin, data.shopId, dayIndex, businessHours);
        }
      } else {
        effectiveDayConfig = await resolveShopDayConfig(admin, data.shopId, dayIndex, businessHours);
      }

    // Apply date overrides (defense in depth)
    const aptOverrideResult = await fetchShopDateOverrides(data.shopId, bookingDate, bookingDate);
    if (aptOverrideResult.success && aptOverrideResult.data) {
      const aptShopOverride = aptOverrideResult.data.find(o => o.staff_id === null);
      if (aptShopOverride) {
        if (aptShopOverride.is_closed) {
          return { success: false, error: "El local esta cerrado este dia" };
        }
        if (aptShopOverride.start_time && aptShopOverride.end_time) {
          const ovStart = Math.max(hhmmToMinutes(effectiveDayConfig.start), hhmmToMinutes(aptShopOverride.start_time));
          const ovEnd = Math.min(hhmmToMinutes(effectiveDayConfig.end), hhmmToMinutes(aptShopOverride.end_time));
          effectiveDayConfig.start = minutesToHHmm(ovStart);
          effectiveDayConfig.end = minutesToHHmm(ovEnd);
        }
        if (aptShopOverride.break_start && aptShopOverride.break_end) {
          const bs = hhmmToMinutes(aptShopOverride.break_start);
          const be = hhmmToMinutes(aptShopOverride.break_end);
          const st = hhmmToMinutes(effectiveDayConfig.start);
          const en = hhmmToMinutes(effectiveDayConfig.end);
          if (st < bs && bs < be && be < en) {
            effectiveDayConfig.break_start = aptShopOverride.break_start;
            effectiveDayConfig.break_end = aptShopOverride.break_end;
          }
        }
      }
      if (data.staffId) {
        const aptStaffOverride = aptOverrideResult.data.find(o => o.staff_id === data.staffId);
        if (aptStaffOverride) {
          if (aptStaffOverride.is_closed) {
            return { success: false, error: "El profesional no trabaja este dia" };
          }
          if (aptStaffOverride.start_time && aptStaffOverride.end_time) {
            const ovStart = Math.max(hhmmToMinutes(effectiveDayConfig.start), hhmmToMinutes(aptStaffOverride.start_time));
            const ovEnd = Math.min(hhmmToMinutes(effectiveDayConfig.end), hhmmToMinutes(aptStaffOverride.end_time));
            effectiveDayConfig.start = minutesToHHmm(ovStart);
            effectiveDayConfig.end = minutesToHHmm(ovEnd);
          }
          if (aptStaffOverride.break_start && aptStaffOverride.break_end) {
            const bs = hhmmToMinutes(aptStaffOverride.break_start);
            const be = hhmmToMinutes(aptStaffOverride.break_end);
            const st = hhmmToMinutes(effectiveDayConfig.start);
            const en = hhmmToMinutes(effectiveDayConfig.end);
            if (st < bs && bs < be && be < en) {
              effectiveDayConfig.break_start = aptStaffOverride.break_start;
              effectiveDayConfig.break_end = aptStaffOverride.break_end;
            }
          }
        }
      }
    }

    if (!effectiveDayConfig.open) {
      const msg = data.staffId
        ? "El profesional no trabaja en este horario"
        : "El local esta cerrado en ese horario";
      return { success: false, error: msg };
    }

    const [sh, sm] = effectiveDayConfig.start.split(":").map(Number);
    const [eh, em] = effectiveDayConfig.end.split(":").map(Number);
    const openMinutes = sh * 60 + sm;
    const closeMinutes = eh * 60 + em;

    if (openMinutes >= closeMinutes || startMinutes < openMinutes || endMinutes > closeMinutes) {
      return { success: false, error: "El horario seleccionado esta fuera del horario de atencion" };
    }

    if (effectiveDayConfig.break_start && effectiveDayConfig.break_end) {
      const [bsh, bsm] = effectiveDayConfig.break_start.split(":").map(Number);
      const [beh, bem] = effectiveDayConfig.break_end.split(":").map(Number);
      const breakStart = bsh * 60 + bsm;
      const breakEnd = beh * 60 + bem;
      if (startMinutes < breakEnd && endMinutes > breakStart) {
        return { success: false, error: "El horario seleccionado coincide con el descanso" };
      }
    }

    // Staff-service validation + auto-assign when Sin preferencia
    let resolvedStaffId = data.staffId || null;

    // Check staff-service compatibility
    if (resolvedStaffId) {
      const { data: staffServiceRows } = await admin
        .from("staff_services")
        .select("service_id")
        .eq("staff_id", resolvedStaffId);
      if (staffServiceRows && staffServiceRows.length > 0) {
        const assigned = staffServiceRows.some((r) => r.service_id === data.serviceId);
        if (!assigned) {
          return { success: false, error: "El profesional no realiza este servicio" };
        }
      }
    } else {
      // Build staff override map for auto-assign candidate checks
      const aptOverrides = aptOverrideResult.success ? (aptOverrideResult.data || []) : [];
      const staffOverrideMap = new Map<string, (typeof aptOverrides)[0]>();
      for (const o of aptOverrides) {
        if (o.staff_id) staffOverrideMap.set(o.staff_id, o);
      }

      // Sin preferencia → auto-assign first available staff
      const { data: allStaff } = await admin
        .from("shop_memberships")
        .select("user_id")
        .eq("shop_id", data.shopId)
        .eq("is_active", true)
        .in("role", ["owner", "staff"]);

      const staffIds = (allStaff || []).map((m) => m.user_id);

      // Check staff_services for all staff
      const { data: allStaffServices } = await admin
        .from("staff_services")
        .select("staff_id, service_id")
        .in("staff_id", staffIds);

      const servicesByStaff = new Map<string, Set<string>>();
      for (const row of allStaffServices || []) {
        if (!servicesByStaff.has(row.staff_id)) servicesByStaff.set(row.staff_id, new Set());
        servicesByStaff.get(row.staff_id)!.add(row.service_id);
      }

      // Get appointments that conflict with this slot
      const { data: conflictingAppts } = await admin
        .from("appointments")
        .select("staff_id, status, created_at")
        .eq("shop_id", data.shopId)
        .lt("start_time", data.endTime)
        .gt("end_time", data.startTime)
        .not("status", "eq", "cancelled")
        .not("staff_id", "eq", null);

      const busyStaffIds = new Set<string>();
      for (const apt of conflictingAppts || []) {
        if (shouldBlockSlot(apt.status, apt.created_at)) {
          busyStaffIds.add(apt.staff_id as string);
        }
      }

      // Get pending bookings that conflict
      const { data: pendingConflicts } = await admin
        .from("pending_bookings")
        .select("staff_id")
        .eq("shop_id", data.shopId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .lt("start_time", data.endTime)
        .gt("end_time", data.startTime)
        .not("staff_id", "eq", null);

      for (const pb of pendingConflicts || []) {
        if (pb.staff_id) busyStaffIds.add(pb.staff_id);
      }

      // Get staff schedules for this day
      const { data: daySchedules } = await admin
        .from("staff_schedules")
        .select("staff_id, is_active, start_time, end_time, break_start, break_end")
        .in("staff_id", staffIds)
        .eq("day_of_week", dayIndex);

      const scheduleMap = new Map((daySchedules || []).map((s) => [s.staff_id, s]));

      for (const sid of staffIds) {
        // Skip if busy
        if (busyStaffIds.has(sid)) continue;

        // Skip if staff not assigned to this service (only if they have assignments)
        const assignedServices = servicesByStaff.get(sid);
        if (assignedServices && assignedServices.size > 0 && !assignedServices.has(data.serviceId)) continue;

        // Check schedule
        const sched = scheduleMap.get(sid);
        if (sched) {
          if (!sched.is_active) continue;
          const [ssh, ssm] = sched.start_time.slice(0, 5).split(":").map(Number);
          const [seh, sem] = sched.end_time.slice(0, 5).split(":").map(Number);
          const staffOpen = ssh * 60 + ssm;
          const staffClose = seh * 60 + sem;
          if (startMinutes < staffOpen || endMinutes > staffClose) continue;
          if (sched.break_start && sched.break_end) {
            const [bsh, bsm] = sched.break_start.slice(0, 5).split(":").map(Number);
            const [beh, bem] = sched.break_end.slice(0, 5).split(":").map(Number);
            const breakStart = bsh * 60 + bsm;
            const breakEnd = beh * 60 + bem;
            if (startMinutes < breakEnd && endMinutes > breakStart) continue;
          }
        }
        // Check staff override break
        const staffOv = staffOverrideMap.get(sid);
        if (staffOv && staffOv.break_start && staffOv.break_end) {
          const [bsh, bsm] = staffOv.break_start.split(":").map(Number);
          const [beh, bem] = staffOv.break_end.split(":").map(Number);
          const breakStart = bsh * 60 + bsm;
          const breakEnd = beh * 60 + bem;
          if (startMinutes < breakEnd && endMinutes > breakStart) continue;
        }
        // else: no schedule → falls within shop hours (already validated above)

        resolvedStaffId = sid;
        break;
      }

      if (!resolvedStaffId) {
        return { success: false, error: "No hay profesionales disponibles para este turno" };
      }
    }

    // Clean up expired pending bookings
    try { await admin.from("pending_bookings").delete().lt("expires_at", new Date().toISOString()); } catch (cleanErr) { console.error("[cleanup] expired pending_bookings delete failed:", cleanErr); }

    // Conflict check for resolved staff
    const [{ data: finalConflicts, error: checkError }, { data: finalPendingConflicts }] = await Promise.all([
      admin
        .from("appointments")
        .select("id, status, created_at")
        .eq("shop_id", data.shopId)
        .eq("staff_id", resolvedStaffId)
        .lt("start_time", data.endTime)
        .gt("end_time", data.startTime)
        .not("status", "eq", "cancelled"),
      admin
        .from("pending_bookings")
        .select("id")
        .eq("shop_id", data.shopId)
        .eq("staff_id", resolvedStaffId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .lt("start_time", data.endTime)
        .gt("end_time", data.startTime),
    ]);

    if (checkError) return { success: false, error: checkError.message };

    const hasBlockingConflict = (finalConflicts || []).some((apt) =>
      shouldBlockSlot(apt.status as string | null | undefined, apt.created_at as string | null | undefined)
    );

    if (hasBlockingConflict || (finalPendingConflicts && finalPendingConflicts.length > 0)) {
      return { success: false, error: "slot_taken" };
    }

    // Create or find customer (atomic: tolerant of concurrent duplicate inserts)
    const customerResolve = await resolveCustomer(admin, {
      shopId: data.shopId,
      customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail ?? null,
      authenticatedUserId: data.authenticatedUserId,
    });

    if (!customerResolve.success) return { success: false, error: customerResolve.error };
    if (!customerResolve.data) return { success: false, error: "No se pudo registrar el cliente" };
    const customerId = customerResolve.data.customerId;

    const { data: serviceRow } = await admin
      .from("services")
      .select("price")
      .eq("id", data.serviceId)
      .maybeSingle();

    const servicePrice = serviceRow?.price ?? null;

    // Re-check conflict right before insert to minimize TOCTOU window
    const [{ data: lastMinuteConflict }, { data: lastMinutePending }] = await Promise.all([
      admin
        .from("appointments")
        .select("id, status, created_at")
        .eq("shop_id", data.shopId)
        .eq("staff_id", resolvedStaffId)
        .lt("start_time", data.endTime)
        .gt("end_time", data.startTime)
        .not("status", "eq", "cancelled"),
      admin
        .from("pending_bookings")
        .select("id")
        .eq("shop_id", data.shopId)
        .eq("staff_id", resolvedStaffId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .lt("start_time", data.endTime)
        .gt("end_time", data.startTime),
    ]);

    const hasLastMinuteConflict = (lastMinuteConflict || []).some((apt) =>
      shouldBlockSlot(apt.status as string | null | undefined, apt.created_at as string | null | undefined)
    );

    if (hasLastMinuteConflict || (lastMinutePending && lastMinutePending.length > 0)) {
      return { success: false, error: "slot_taken" };
    }

    const { data: createdAppointment, error: aptError } = await admin
      .from("appointments")
      .insert({
        shop_id: data.shopId,
        customer_id: customerId,
        staff_id: resolvedStaffId,
        service_id: data.serviceId,
        service_price: servicePrice,
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
          admin.from("shops").select("nombre, address, localidad, google_maps_url, phone, instagram_url, whatsapp_template").eq("id", data.shopId).maybeSingle(),
          admin.from("services").select("name").eq("id", data.serviceId).maybeSingle(),
        ]);

        const shopData = (shop as { nombre?: string | null; address?: string | null; localidad?: string | null; google_maps_url?: string | null; phone?: string | null; instagram_url?: string | null; whatsapp_template?: string | null } | null) || null;
        const serviceName = (service as { name?: string | null } | null)?.name || "Servicio";
        const locationParts = [shopData?.address?.trim(), shopData?.localidad?.trim()].filter(Boolean);
        const shopAddress = locationParts.length > 0 ? locationParts.join(", ") : undefined;
        const mapsUrl = shopData?.google_maps_url?.trim() || undefined;
        const cleanPhone = shopData?.phone?.replace(/^\+/, "").replace(/\D/g, "") || "";
        const whatsappUrl = cleanPhone.length >= 7 ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shopData?.whatsapp_template || "Hola! Quiero consultar sobre un turno")}` : undefined;

        await sendAppointmentConfirmationEmail({
          to: data.customerEmail,
          customerName: customerName,
          shopName: shopData?.nombre || "Klip",
          serviceName,
          shopAddress,
          startTime: data.startTime,
          endTime: data.endTime,
          mapsUrl,
          instagramUrl: shopData?.instagram_url?.trim() || undefined,
          whatsappUrl,
        });

        await scheduleAppointmentReminderEmail({
          to: data.customerEmail,
          customerName: customerName,
          shopName: shopData?.nombre || "Klip",
          serviceName,
          shopAddress,
          startTime: data.startTime,
          endTime: data.endTime,
          mapsUrl,
          instagramUrl: shopData?.instagram_url?.trim() || undefined,
          whatsappUrl,
        });
      } catch (mailError) {
        console.error("[createPublicAppointment] confirmation email error:", mailError);
      }
    }

    if (data.status !== "pending_payment" && !data.skipRepeatCache) {
      completedBookingCache.set(ipKey, true);
    }

    return { success: true, data: { customerId, appointmentId: createdAppointment.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno" };
  }
}

export async function createPublicComboAppointment(data: {
  shopId: string;
  comboId: string;
  comboName: string;
  comboPrice: number;
  services: { id: string; name: string; duration_minutes: number; price: number }[];
  staffId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  authenticatedUserId?: string;
  status?: "scheduled" | "pending_payment";
  startTime: string;
}): Promise<ActionResult<{ customerId: string; appointmentIds: string[] }>> {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || "unknown";
    const ipKey = `completed-booking:${ip}:${data.shopId}`;
    const isRepeatBooking = completedBookingCache.has(ipKey);

    if (isRepeatBooking && !data.authenticatedUserId) {
      return { success: false, error: "login_required" };
    }

    const admin = await createAdminClient();

    const startDate = new Date(data.startTime);
    if (Number.isNaN(startDate.getTime())) {
      return { success: false, error: "Horario invalido" };
    }

    if (data.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.customerEmail)) {
      return { success: false, error: "Email inválido" };
    }
    const cleanPhone = data.customerPhone.replace(/\D/g, "");
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return { success: false, error: "Teléfono inválido" };
    }

    const customerName = data.customerName.trim();
    if (customerName.length < 2 || customerName.length > 100) {
      return { success: false, error: "Nombre inválido" };
    }

    const totalDuration = data.services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    if (totalDuration <= 0) {
      return { success: false, error: "Duracion invalida" };
    }
    const endDate = new Date(startDate.getTime() + totalDuration * 60000);

    const bookingDate = getArgentinaDateKey(data.startTime);
    const todayAr = getArgentinaDateString();
    if (bookingDate < todayAr) {
      return { success: false, error: "No se puede reservar en una fecha pasada" };
    }
    if (bookingDate === todayAr) {
      const nowMinutes = getArgentinaMinutesSinceMidnight(new Date());
      const bookingMinutes = getArgentinaMinutesSinceMidnight(data.startTime);
      if (bookingMinutes < nowMinutes) {
        return { success: false, error: "No se puede reservar en un horario pasado" };
      }
    }

    const dayIndex = getWeekdayFromDateString(bookingDate);
    const startMinutes = getArgentinaMinutesSinceMidnight(data.startTime);
    const endMinutes = getArgentinaMinutesSinceMidnight(endDate.toISOString());

    // Fetch shop hours once for all resolveShopDayConfig calls in this function
    const { data: shopHoursRow } = await admin
      .from("shops")
      .select("business_hours")
      .eq("id", data.shopId)
      .maybeSingle();
    const businessHours = shopHoursRow?.business_hours;

    // Resolve effective schedule: staff schedule takes priority, fallback to shop hours
    let effectiveDayConfig: { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null };

    if (data.staffId) {
      const { data: staffSchedule } = await admin
        .from("staff_schedules")
        .select("is_active, start_time, end_time, break_start, break_end")
        .eq("staff_id", data.staffId)
        .eq("day_of_week", dayIndex)
        .maybeSingle();

      if (staffSchedule) {
        if (!staffSchedule.is_active) {
          return { success: false, error: "El profesional no trabaja este dia" };
        }
        effectiveDayConfig = {
          open: true,
          start: staffSchedule.start_time.slice(0, 5),
          end: staffSchedule.end_time.slice(0, 5),
          break_start: staffSchedule.break_start?.slice(0, 5) ?? null,
          break_end: staffSchedule.break_end?.slice(0, 5) ?? null,
        };
        // Intersect staff schedule with shop hours
        const shopConfig = await resolveShopDayConfig(admin, data.shopId, dayIndex, businessHours);
        if (shopConfig.open) {
          const interStart = Math.max(hhmmToMinutes(effectiveDayConfig.start), hhmmToMinutes(shopConfig.start));
          const interEnd = Math.min(hhmmToMinutes(effectiveDayConfig.end), hhmmToMinutes(shopConfig.end));
          effectiveDayConfig.start = minutesToHHmm(interStart);
          effectiveDayConfig.end = minutesToHHmm(interEnd);
        }
      } else {
        effectiveDayConfig = await resolveShopDayConfig(admin, data.shopId, dayIndex, businessHours);
      }
    } else {
      effectiveDayConfig = await resolveShopDayConfig(admin, data.shopId, dayIndex, businessHours);
    }

    // Apply date overrides (defense in depth)
    const comboOverrideResult = await fetchShopDateOverrides(data.shopId, bookingDate, bookingDate);
    if (comboOverrideResult.success && comboOverrideResult.data) {
      const comboShopOverride = comboOverrideResult.data.find(o => o.staff_id === null);
      if (comboShopOverride) {
        if (comboShopOverride.is_closed) {
          return { success: false, error: "El local esta cerrado este dia" };
        }
        if (comboShopOverride.start_time && comboShopOverride.end_time) {
          const ovStart = Math.max(hhmmToMinutes(effectiveDayConfig.start), hhmmToMinutes(comboShopOverride.start_time));
          const ovEnd = Math.min(hhmmToMinutes(effectiveDayConfig.end), hhmmToMinutes(comboShopOverride.end_time));
          effectiveDayConfig.start = minutesToHHmm(ovStart);
          effectiveDayConfig.end = minutesToHHmm(ovEnd);
        }
        if (comboShopOverride.break_start && comboShopOverride.break_end) {
          const bs = hhmmToMinutes(comboShopOverride.break_start);
          const be = hhmmToMinutes(comboShopOverride.break_end);
          const st = hhmmToMinutes(effectiveDayConfig.start);
          const en = hhmmToMinutes(effectiveDayConfig.end);
          if (st < bs && bs < be && be < en) {
            effectiveDayConfig.break_start = comboShopOverride.break_start;
            effectiveDayConfig.break_end = comboShopOverride.break_end;
          }
        }
      }
      if (data.staffId) {
        const comboStaffOverride = comboOverrideResult.data.find(o => o.staff_id === data.staffId);
        if (comboStaffOverride) {
          if (comboStaffOverride.is_closed) {
            return { success: false, error: "El profesional no trabaja este dia" };
          }
          if (comboStaffOverride.start_time && comboStaffOverride.end_time) {
            const ovStart = Math.max(hhmmToMinutes(effectiveDayConfig.start), hhmmToMinutes(comboStaffOverride.start_time));
            const ovEnd = Math.min(hhmmToMinutes(effectiveDayConfig.end), hhmmToMinutes(comboStaffOverride.end_time));
            effectiveDayConfig.start = minutesToHHmm(ovStart);
            effectiveDayConfig.end = minutesToHHmm(ovEnd);
          }
          if (comboStaffOverride.break_start && comboStaffOverride.break_end) {
            const bs = hhmmToMinutes(comboStaffOverride.break_start);
            const be = hhmmToMinutes(comboStaffOverride.break_end);
            const st = hhmmToMinutes(effectiveDayConfig.start);
            const en = hhmmToMinutes(effectiveDayConfig.end);
            if (st < bs && bs < be && be < en) {
              effectiveDayConfig.break_start = comboStaffOverride.break_start;
              effectiveDayConfig.break_end = comboStaffOverride.break_end;
            }
          }
        }
      }
    }

    if (!effectiveDayConfig.open) {
      const msg = data.staffId
        ? "El profesional no trabaja en este horario"
        : "El local esta cerrado en ese horario";
      return { success: false, error: msg };
    }

    const [sh, sm] = effectiveDayConfig.start.split(":").map(Number);
    const [eh, em] = effectiveDayConfig.end.split(":").map(Number);
    const openMinutes = sh * 60 + sm;
    const closeMinutes = eh * 60 + em;

    if (openMinutes >= closeMinutes || startMinutes < openMinutes || endMinutes > closeMinutes) {
      return { success: false, error: "El horario seleccionado esta fuera del horario de atencion" };
    }

    if (effectiveDayConfig.break_start && effectiveDayConfig.break_end) {
      const [bsh, bsm] = effectiveDayConfig.break_start.split(":").map(Number);
      const [beh, bem] = effectiveDayConfig.break_end.split(":").map(Number);
      const breakStart = bsh * 60 + bsm;
      const breakEnd = beh * 60 + bem;
      if (startMinutes < breakEnd && endMinutes > breakStart) {
        return { success: false, error: "El horario seleccionado coincide con el descanso" };
      }
    }

    // Staff-service validation + auto-assign when Sin preferencia

    let resolvedStaffId = data.staffId || null;

    if (resolvedStaffId) {
      const { data: staffServiceRows } = await admin
        .from("staff_services")
        .select("service_id")
        .eq("staff_id", resolvedStaffId);
      if (staffServiceRows && staffServiceRows.length > 0) {
        const assigned = data.services.every((svc) => staffServiceRows.some((r) => r.service_id === svc.id));
        if (!assigned) {
          return { success: false, error: "El profesional no realiza uno de los servicios del combo" };
        }
      }
    } else {
      // Sin preferencia → auto-assign first available staff
      const { data: allStaff } = await admin
        .from("shop_memberships")
        .select("user_id")
        .eq("shop_id", data.shopId)
        .eq("is_active", true)
        .in("role", ["owner", "staff"]);

      const staffIds = (allStaff || []).map((m) => m.user_id);

      const { data: allStaffServices } = await admin
        .from("staff_services")
        .select("staff_id, service_id")
        .in("staff_id", staffIds);

      const servicesByStaff = new Map<string, Set<string>>();
      for (const row of allStaffServices || []) {
        if (!servicesByStaff.has(row.staff_id)) servicesByStaff.set(row.staff_id, new Set());
        servicesByStaff.get(row.staff_id)!.add(row.service_id);
      }

      const { data: conflictingAppts } = await admin
        .from("appointments")
        .select("staff_id, status, created_at")
        .eq("shop_id", data.shopId)
        .lt("start_time", endDate.toISOString())
        .gt("end_time", data.startTime)
        .not("status", "eq", "cancelled")
        .not("staff_id", "eq", null);

      const busyStaffIds = new Set<string>();
      for (const apt of conflictingAppts || []) {
        if (shouldBlockSlot(apt.status, apt.created_at)) {
          busyStaffIds.add(apt.staff_id as string);
        }
      }

      const { data: pendingConflicts } = await admin
        .from("pending_bookings")
        .select("staff_id")
        .eq("shop_id", data.shopId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .lt("start_time", endDate.toISOString())
        .gt("end_time", data.startTime)
        .not("staff_id", "eq", null);

      for (const pb of pendingConflicts || []) {
        if (pb.staff_id) busyStaffIds.add(pb.staff_id);
      }

      const { data: daySchedules } = await admin
        .from("staff_schedules")
        .select("staff_id, is_active, start_time, end_time, break_start, break_end")
        .in("staff_id", staffIds)
        .eq("day_of_week", dayIndex);

      const scheduleMap = new Map((daySchedules || []).map((s) => [s.staff_id, s]));

      // Build staff override map for auto-assign candidate checks
      const comboOverrides = comboOverrideResult.success ? (comboOverrideResult.data || []) : [];
      const staffOverrideMap = new Map<string, (typeof comboOverrides)[0]>();
      for (const o of comboOverrides) {
        if (o.staff_id) staffOverrideMap.set(o.staff_id, o);
      }

      for (const sid of staffIds) {
        if (busyStaffIds.has(sid)) continue;

        const assignedServices = servicesByStaff.get(sid);
        if (assignedServices && assignedServices.size > 0) {
          const canDoAllComboServices = data.services.every((svc) => assignedServices!.has(svc.id));
          if (!canDoAllComboServices) continue;
        }

        const sched = scheduleMap.get(sid);
        if (sched) {
          if (!sched.is_active) continue;
          const [ssh, ssm] = sched.start_time.slice(0, 5).split(":").map(Number);
          const [seh, sem] = sched.end_time.slice(0, 5).split(":").map(Number);
          const staffOpen = ssh * 60 + ssm;
          const staffClose = seh * 60 + sem;
          if (startMinutes < staffOpen || endMinutes > staffClose) continue;
          if (sched.break_start && sched.break_end) {
            const [bsh, bsm] = sched.break_start.slice(0, 5).split(":").map(Number);
            const [beh, bem] = sched.break_end.slice(0, 5).split(":").map(Number);
            const breakStart = bsh * 60 + bsm;
            const breakEnd = beh * 60 + bem;
            if (startMinutes < breakEnd && endMinutes > breakStart) continue;
          }
        }
        // Check staff override break
        const staffOv = staffOverrideMap.get(sid);
        if (staffOv && staffOv.break_start && staffOv.break_end) {
          const [bsh, bsm] = staffOv.break_start.split(":").map(Number);
          const [beh, bem] = staffOv.break_end.split(":").map(Number);
          const breakStart = bsh * 60 + bsm;
          const breakEnd = beh * 60 + bem;
          if (startMinutes < breakEnd && endMinutes > breakStart) continue;
        }

        resolvedStaffId = sid;
        break;
      }

      if (!resolvedStaffId) {
        return { success: false, error: "No hay profesionales disponibles para este turno" };
      }
    }

    // Create or find customer (atomic: tolerant of concurrent duplicate inserts)
    const comboCustomerResolve = await resolveCustomer(admin, {
      shopId: data.shopId,
      customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail ?? null,
      authenticatedUserId: data.authenticatedUserId,
    });

    if (!comboCustomerResolve.success) return { success: false, error: comboCustomerResolve.error };
    if (!comboCustomerResolve.data) return { success: false, error: "No se pudo registrar el cliente" };
    const customerId = comboCustomerResolve.data.customerId;

    // Clean up expired pending bookings
    admin.from("pending_bookings").delete().lt("expires_at", new Date().toISOString()).then(() => {}, () => {});

    // Check conflicts for the full time block
    const [{ data: finalConflicts, error: checkError }, { data: finalPendingConflicts }] = await Promise.all([
      admin
        .from("appointments")
        .select("id, status, created_at")
        .eq("shop_id", data.shopId)
        .eq("staff_id", resolvedStaffId)
        .lt("start_time", endDate.toISOString())
        .gt("end_time", data.startTime)
        .not("status", "eq", "cancelled"),
      admin
        .from("pending_bookings")
        .select("id")
        .eq("shop_id", data.shopId)
        .eq("staff_id", resolvedStaffId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .lt("start_time", endDate.toISOString())
        .gt("end_time", data.startTime),
    ]);

    if (checkError) return { success: false, error: checkError.message };

    const hasBlockingConflict = (finalConflicts || []).some((apt) =>
      shouldBlockSlot(apt.status as string | null | undefined, apt.created_at as string | null | undefined)
    );

    if (hasBlockingConflict || (finalPendingConflicts && finalPendingConflicts.length > 0)) {
      return { success: false, error: "slot_taken" };
    }

    // Prorate combo price across services
    const totalOriginalPrice = data.services.reduce((sum, s) => sum + s.price, 0);
    const proratedPrices: number[] = [];

    for (const svc of data.services) {
      const rawPrice = totalOriginalPrice > 0
        ? (data.comboPrice * svc.price) / totalOriginalPrice
        : data.comboPrice / data.services.length;
      proratedPrices.push(Math.round(rawPrice * 100) / 100);
    }

    // Adjust last service to absorb rounding remainder so sum matches comboPrice exactly
    const priceSum = proratedPrices.reduce((a, b) => a + b, 0);
    const diff = Math.round((data.comboPrice - priceSum) * 100) / 100;
    if (proratedPrices.length > 0 && Math.abs(diff) > 0) {
      proratedPrices[proratedPrices.length - 1] = Math.round((proratedPrices[proratedPrices.length - 1] + diff) * 100) / 100;
    }

    let runningMinutes = 0;
    const appointmentIds: string[] = [];
    const combTotalDuration = data.services.reduce((sum, s) => sum + s.duration_minutes, 0);
    const combEndTime = new Date(startDate.getTime() + combTotalDuration * 60000).toISOString();

    for (let i = 0; i < data.services.length; i++) {
      const svc = data.services[i];
      const aptStart = new Date(startDate.getTime() + runningMinutes * 60000);
      const aptEnd = new Date(aptStart.getTime() + svc.duration_minutes * 60000);

      const { data: created, error: aptError } = await admin
        .from("appointments")
        .insert({
          shop_id: data.shopId,
          customer_id: customerId,
          staff_id: resolvedStaffId,
          service_id: svc.id,
          service_price: proratedPrices[i],
          start_time: aptStart.toISOString(),
          end_time: aptEnd.toISOString(),
          date_key_ar: getArgentinaDateKey(data.startTime),
          status: data.status ?? "scheduled",
          is_paid: false,
        })
        .select("id")
        .single();

      if (aptError) {
        // Rollback created appointments (batch delete)
        if (appointmentIds.length > 0) {
          const { error: rollbackError } = await admin.from("appointments").delete().in("id", appointmentIds);
          if (rollbackError) {
            console.error("[createPublicComboAppointment] CRITICAL: rollback delete failed:", rollbackError);
          }
        }
        return { success: false, error: aptError.message };
      }

      appointmentIds.push(created.id);
      runningMinutes += svc.duration_minutes;
    }

    // Send confirmation email
    if (data.customerEmail) {
      try {
        const [{ data: shop }, firstSvc] = await Promise.all([
          admin.from("shops").select("nombre, address, localidad, google_maps_url, phone, instagram_url, whatsapp_template").eq("id", data.shopId).maybeSingle(),
          Promise.resolve(data.services[0]),
        ]);
        const shopData = (shop as { nombre?: string | null; address?: string | null; localidad?: string | null; google_maps_url?: string | null; phone?: string | null; instagram_url?: string | null; whatsapp_template?: string | null } | null) || null;
        const serviceName = data.comboName || firstSvc?.name || "Combo";
        const locationParts = [shopData?.address?.trim(), shopData?.localidad?.trim()].filter(Boolean);
        const shopAddress = locationParts.length > 0 ? locationParts.join(", ") : undefined;
        const mapsUrl = shopData?.google_maps_url?.trim() || undefined;
        const cleanPhone = shopData?.phone?.replace(/^\+/, "").replace(/\D/g, "") || "";
        const whatsappUrl = cleanPhone.length >= 7 ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shopData?.whatsapp_template || "Hola! Quiero consultar sobre un turno")}` : undefined;

        await sendAppointmentConfirmationEmail({
          to: data.customerEmail,
          customerName: customerName,
          shopName: shopData?.nombre || "Klip",
          serviceName,
          shopAddress,
          startTime: data.startTime,
          endTime: combEndTime,
          mapsUrl,
          instagramUrl: shopData?.instagram_url?.trim() || undefined,
          whatsappUrl,
        });

        await scheduleAppointmentReminderEmail({
          to: data.customerEmail,
          customerName: customerName,
          shopName: shopData?.nombre || "Klip",
          serviceName,
          shopAddress,
          startTime: data.startTime,
          endTime: combEndTime,
          mapsUrl,
          instagramUrl: shopData?.instagram_url?.trim() || undefined,
          whatsappUrl,
        });
      } catch (mailError) {
        console.error("[createPublicComboAppointment] confirmation email error:", mailError);
      }
    }

    if (data.status !== "pending_payment") {
      completedBookingCache.set(ipKey, true);
    }

    return { success: true, data: { customerId, appointmentIds } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno combo" };
  }
}

type CreatePaymentPreferenceInput = {
  appointmentId: string;
  shopId: string;
  shopSlug: string;
  overridePrice?: number;
  comboAppointmentIds?: string[];
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
      .maybeSingle();

    if (appointmentError || !appointment) {
      return { success: false, error: "Turno no encontrado para generar preferencia" };
    }

    const { data: service, error: serviceError } = await admin
      .from("services")
      .select("name, price")
      .eq("id", appointment.service_id ?? "")
      .maybeSingle();

    if (serviceError || !service) {
      return { success: false, error: "Servicio no encontrado para generar preferencia" };
    }

    const serviceName = service.name;
    const effectivePrice = appointmentData.overridePrice !== undefined ? appointmentData.overridePrice : (Number(service.price) || 0);

    const { data: shopPolicy, error: shopPolicyError } = await admin
      .from("shops")
      .select("booking_deposit_enabled, booking_deposit_amount, mp_access_token")
      .eq("id", appointment.shop_id)
      .maybeSingle();

    let resolvedShopPolicy = shopPolicy;
    if ((!resolvedShopPolicy || shopPolicyError) && appointmentData.shopSlug) {
      const { data: bySlug } = await admin
        .from("shops")
        .select("booking_deposit_enabled, booking_deposit_amount, mp_access_token")
        .eq("slug", appointmentData.shopSlug)
        .maybeSingle();
      if (bySlug) resolvedShopPolicy = bySlug;
    }

    const accessToken = (resolvedShopPolicy?.mp_access_token as string | undefined) || process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return { success: false, error: "Mercado Pago no esta configurado para este local. Reconecta Mercado Pago en Mi Negocio." };
    }

    const servicePrice = Math.max(0, effectivePrice);
    const depositEnabled = resolvedShopPolicy?.booking_deposit_enabled !== false;
    const configuredDeposit = Math.max(0, Number(resolvedShopPolicy?.booking_deposit_amount ?? 0));
    const chargeAmount = depositEnabled
      ? Math.max(1, Math.min(servicePrice, configuredDeposit > 0 ? configuredDeposit : servicePrice))
      : Math.max(1, servicePrice);

    await admin
      .from("appointments")
      .update({
        deposit_amount: chargeAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id)
      .eq("shop_id", appointmentData.shopId);

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar").replace(/\/+$/, "");
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
            title: depositEnabled ? `Seña - ${serviceName}` : serviceName,
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
          ...(appointmentData.comboAppointmentIds ? { combo_appointment_ids: JSON.stringify(appointmentData.comboAppointmentIds) } : {}),
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

export type CombinedCheckoutInput = {
  shopId: string;
  shopSlug: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  authenticatedUserId?: string;
  paymentMethod: "mp" | "bank_transfer";
  staffId?: string;
  startTime: string;
  combo?: {
    comboId: string;
    comboName: string;
    comboPrice: number;
    services: { id: string; name: string; duration_minutes: number; price: number }[];
    totalDuration: number;
  };
  cartServices?: { id: string; name: string; duration_minutes: number; price: number }[];
  storeItems: StoreCheckoutItem[];
};

export type CombinedCheckoutOutput = {
  appointmentIds: string[];
  orderId: string;
  serviceAmount: number;
  productsAmount: number;
  totalAmount: number;
  chargedAmount: number;
  isDeposit: boolean;
  initPoint?: string;
  preferenceId?: string;
  bankTransfer?: { cbu: string; alias: string; bankName: string };
};

/**
 * Combined checkout: reserves the appointment(s) AND creates the store order in one
 * action, paying everything together (one Mercado Pago preference or one bank transfer).
 * On failure it rolls back both the appointments and the order (restoring stock).
 */
export async function createCombinedCheckout(
  input: CombinedCheckoutInput
): Promise<ActionResult<CombinedCheckoutOutput>> {
  try {
    const admin = await createAdminClient();
    const appointmentIds: string[] = [];

    const rollbackAppointments = async () => {
      if (appointmentIds.length === 0) return;
      await admin
        .from("appointments")
        .delete()
        .eq("shop_id", input.shopId)
        .eq("status", "pending_payment")
        .in("id", appointmentIds);
    };

    // 1. Create appointments (pending_payment)
    if (input.combo) {
      const combo = input.combo;
      const result = await createPublicComboAppointment({
        shopId: input.shopId,
        comboId: combo.comboId,
        comboName: combo.comboName,
        comboPrice: combo.comboPrice,
        services: combo.services.map((s) => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price })),
        staffId: input.staffId,
        customerName: input.customerName,
        customerEmail: input.customerEmail?.trim() || undefined,
        customerPhone: input.customerPhone,
        authenticatedUserId: input.authenticatedUserId,
        status: "pending_payment",
        startTime: input.startTime,
      });
      if (!result.success) return result;
      if (result.data) appointmentIds.push(...result.data.appointmentIds);
    } else if (input.cartServices && input.cartServices.length > 0) {
      let prevEnd = input.startTime;
      for (const svc of input.cartServices) {
        const svcStart = prevEnd;
        const svcEnd = new Date(new Date(svcStart).getTime() + svc.duration_minutes * 60000).toISOString();
        const result = await createPublicAppointment({
          shopId: input.shopId,
          serviceId: svc.id,
          staffId: input.staffId,
          customerName: input.customerName,
          customerEmail: input.customerEmail?.trim() || undefined,
          customerPhone: input.customerPhone,
          authenticatedUserId: input.authenticatedUserId,
          status: "pending_payment",
          startTime: svcStart,
          endTime: svcEnd,
        });
        if (!result.success) {
          await rollbackAppointments();
          return result;
        }
        if (result.data) appointmentIds.push(result.data.appointmentId);
        prevEnd = svcEnd;
      }
    } else {
      return { success: false, error: "No seleccionaste servicios ni combo" };
    }

    if (appointmentIds.length === 0) {
      return { success: false, error: "No se pudo crear el turno" };
    }

    const serviceAmount = input.combo
      ? input.combo.comboPrice
      : (input.cartServices || []).reduce((sum, svc) => sum + svc.price, 0);

    // 2. Create the store order (stock already decremented)
    const orderResult = await createStoreOrderRecord({
      shopId: input.shopId,
      items: input.storeItems,
      customerName: input.customerName,
      customerEmail: input.customerEmail?.trim() || "",
      customerPhone: input.customerPhone,
    });
    if (!orderResult.success) {
      await rollbackAppointments();
      return { success: false, error: orderResult.error || "No se pudo crear el pedido" };
    }
    if (!orderResult.data) {
      await rollbackAppointments();
      return { success: false, error: "No se pudo crear el pedido" };
    }
    const { orderId, lineItems, totalAmount: productsAmount } = orderResult.data;

    const rollbackOrder = async () => {
      await restoreOrderStock(admin, input.shopId, orderId);
      await admin.from("orders").delete().eq("id", orderId).eq("shop_id", input.shopId);
    };

    const totalAmount = serviceAmount + productsAmount;
    const mainAppointmentId = appointmentIds[0];

    // 3. Bank transfer — return the details so the client can show them
    if (input.paymentMethod === "bank_transfer") {
      const { data: shop } = await admin
        .from("shops")
        .select("bank_cvu_cbu, bank_alias, bank_name")
        .eq("id", input.shopId)
        .maybeSingle();

      return {
        success: true,
        data: {
          appointmentIds,
          orderId,
          serviceAmount,
          productsAmount,
          totalAmount,
          chargedAmount: totalAmount,
          isDeposit: false,
          bankTransfer: {
            cbu: shop?.bank_cvu_cbu || "",
            alias: shop?.bank_alias || "",
            bankName: shop?.bank_name || "",
          },
        },
      };
    }

    // 4. Mercado Pago — one combined preference
    const { data: shop } = await admin
      .from("shops")
      .select("booking_deposit_enabled, booking_deposit_amount, mp_access_token")
      .eq("id", input.shopId)
      .maybeSingle();

    const accessToken = (shop?.mp_access_token as string | undefined) || process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      await rollbackOrder();
      await rollbackAppointments();
      return { success: false, error: "Mercado Pago no esta configurado para este local. Reconecta Mercado Pago en Mi Negocio." };
    }

    // Deposit applies only to the service portion; products always charge full price
    const depositEnabled = shop?.booking_deposit_enabled !== false;
    const configuredDeposit = Math.max(0, Number(shop?.booking_deposit_amount ?? 0));
    const depositCharge = depositEnabled
      ? Math.max(1, Math.min(serviceAmount, configuredDeposit > 0 ? configuredDeposit : serviceAmount))
      : Math.max(1, serviceAmount);
    const isDeposit = depositEnabled && depositCharge < serviceAmount;
    const chargedAmount = depositCharge + productsAmount;

    const cartLen = input.cartServices?.length ?? 0;
    const serviceTitle = input.combo
      ? input.combo.comboName
      : cartLen === 1
        ? (input.cartServices?.[0]?.name ?? "Servicio")
        : `${cartLen} servicios`;

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar").replace(/\/+$/, "");
    const successUrl = `${baseUrl}/confirmacion?status=success&slug=${encodeURIComponent(input.shopSlug)}`;
    const pendingUrl = `${baseUrl}/confirmacion?status=pending&slug=${encodeURIComponent(input.shopSlug)}`;
    const failureUrl = `${baseUrl}/confirmacion?status=failure&slug=${encodeURIComponent(input.shopSlug)}`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook`;
    const canUseBackUrls = /^https?:\/\//.test(baseUrl) && !/localhost|127\.0\.0\.1/.test(baseUrl);
    const shouldSendWebhook = notificationUrl.startsWith("https://");

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    let preferenceResult;
    try {
      preferenceResult = await preference.create({
        body: {
          items: [
            {
              id: mainAppointmentId,
              title: isDeposit ? `Seña - ${serviceTitle}` : serviceTitle,
              quantity: 1,
              unit_price: depositCharge,
              currency_id: "ARS",
            },
            ...lineItems.map((li) => ({
              id: li.productId,
              title: li.name,
              quantity: li.quantity,
              unit_price: li.unitPrice,
              currency_id: "ARS",
            })),
          ],
          back_urls: canUseBackUrls
            ? { success: successUrl, pending: pendingUrl, failure: failureUrl }
            : undefined,
          auto_return: canUseBackUrls ? "approved" : undefined,
          external_reference: mainAppointmentId,
          notification_url: shouldSendWebhook ? notificationUrl : undefined,
          metadata: {
            type: "combined",
            appointment_id: mainAppointmentId,
            shop_id: input.shopId,
            order_id: orderId,
            ...(input.combo ? { combo_appointment_ids: JSON.stringify(appointmentIds) } : {}),
          },
        },
      });
    } catch (e) {
      await rollbackOrder();
      await rollbackAppointments();
      throw e;
    }

    if (!preferenceResult.id || !preferenceResult.init_point) {
      await rollbackOrder();
      await rollbackAppointments();
      throw new Error("No se pudo crear la preferencia de pago");
    }

    await admin
      .from("orders")
      .update({ mp_preference_id: preferenceResult.id, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("shop_id", input.shopId);

    await admin
      .from("appointments")
      .update({ deposit_amount: depositCharge, updated_at: new Date().toISOString() })
      .eq("id", mainAppointmentId)
      .eq("shop_id", input.shopId);

    return {
      success: true,
      data: {
        appointmentIds,
        orderId,
        serviceAmount,
        productsAmount,
        totalAmount,
        chargedAmount,
        isDeposit,
        initPoint: preferenceResult.init_point,
        preferenceId: preferenceResult.id,
      },
    };
  } catch (error) {
    console.error("[createCombinedCheckout] error:", error);
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
      error: detailedMessage || (error instanceof Error ? error.message : "Error inesperado al procesar el pago"),
    };
  }
}
