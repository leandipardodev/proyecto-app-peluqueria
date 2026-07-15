import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, getShopId } from "@/lib/dashboard/auth/server";
import { getArgentinaNow, getArgentinaDateString, getArgentinaDayBounds, getArgentinaMinutesSinceMidnight, minutesFromHHmm } from "@/lib/argentina-time";
import { APPOINTMENT_STATUS_NEEDS_CONFIRMATION } from "@/lib/dashboard/appointments/status";

export const dynamic = "force-dynamic";

type DashboardNotification = {
  id: string;
  type: "nuevo_turno" | "turno_cancelado" | "recompensa_disponible" | "cliente_cumpleaños" | "stock_bajo" | "nuevo_miembro" | "oportunidad_estacional" | "voucher_enviado" | "plan_por_vencer" | "transferencia_pendiente";
  category: "urgent" | "action" | "info";
  title: string;
  description: string;
  href: string;
  timestamp: string;
};

function seasonalMomentLabel(now: Date): string | null {
  const sameMonthDay = (month: number, day: number) => now.getMonth() === month && now.getDate() === day;
  const thirdSundayOfOctober = (year: number) => {
    const firstDay = new Date(year, 9, 1);
    const firstSundayOffset = (7 - firstDay.getDay()) % 7;
    return new Date(year, 9, 1 + firstSundayOffset + 14);
  };
  if (sameMonthDay(1, 14)) return "14 de febrero - San Valentín. Buen momento para promociones.";
  if (sameMonthDay(2, 8)) return "8 de marzo - Día de la Mujer. Oportunidad para campañas especiales.";
  if (sameMonthDay(2, 21)) return "21 de marzo - Inicio de temporada. Ideal para renovar tu oferta.";
  if (sameMonthDay(5, 21)) return "21 de junio - Día del Padre. Momento clave para promocionar.";
  if (sameMonthDay(7, 25)) return "25 de agosto - Fecha especial del rubro. Aprovechá para campañas.";
  if (sameMonthDay(8, 21)) return "21 de septiembre - Inicio de temporada. Prepará tus servicios.";
  const thirdSunday = thirdSundayOfOctober(now.getFullYear());
  if (now.getMonth() === 9 && now.getDate() === thirdSunday.getDate()) return "Día de la Madre. Oportunidad para llegar a más clientes.";
  if (now.getMonth() === 11) return "Diciembre - Fiestas de fin de año. Aumentá tu presencia digital.";
  return null;
}

function isBirthdayThisWeek(dateStr: string, now: Date): boolean {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const candidate = new Date(now.getFullYear(), date.getMonth(), date.getDate());
    candidate.setHours(0, 0, 0, 0);
    return candidate >= weekStart && candidate <= weekEnd;
  } catch {
    return false;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  } catch {
    return "";
  }
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const authUser = (await supabase.auth.getUser()).data?.user;
    if (!authUser) {
      return NextResponse.json({ items: [], pendingComplete: [], urgentAppointments: false, lowStock: false }, { status: 200 });
    }

    const shopId = await getShopId({ user: { id: authUser.id } });
    if (!shopId) {
      return NextResponse.json({ items: [], pendingComplete: [], urgentAppointments: false, lowStock: false }, { status: 200 });
    }

    const admin = await createServiceRoleClient();
    const nowAr = getArgentinaNow();
    const todayDateStr = getArgentinaDateString();
    const { start: todayStart, end: todayEnd } = getArgentinaDayBounds(todayDateStr);
    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();
    const oneHourFromNow = new Date(nowAr.getTime() + 60 * 60 * 1000).toISOString();
    const weekAgoIso = new Date(nowAr.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [urgentRes, stockCountRes, todayApptsRes, cancelledRes, loyaltyRes, customersRes, vouchersRes, staffRes, shopRes, pendingCompleteRes, businessHoursRes, bankTransfersRes] = await Promise.all([
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("shop_id", shopId).in("status", APPOINTMENT_STATUS_NEEDS_CONFIRMATION as unknown as string[]).gte("start_time", nowAr.toISOString()).lte("start_time", oneHourFromNow),
      admin.from("stock").select("id", { count: "exact", head: true }).eq("shop_id", shopId).lt("quantity", 5),
      admin.from("appointments").select("id, start_time, customers(nombre)").eq("shop_id", shopId).in("status", ["scheduled", "confirmed", "pending_payment"]).gte("start_time", todayStartIso).lte("start_time", todayEndIso).order("start_time", { ascending: true }).limit(10),
      admin.from("appointments").select("id, start_time, customers(nombre)").eq("shop_id", shopId).eq("status", "cancelled").gte("start_time", todayStartIso).lte("start_time", todayEndIso).order("start_time", { ascending: true }).limit(10),
      admin.from("customers").select("id, nombre, loyalty_rewards_available").eq("shop_id", shopId).gt("loyalty_rewards_available", 0).order("loyalty_rewards_available", { ascending: false }).limit(10),
      admin.from("customers").select("id, nombre, cumpleaños" as any).eq("shop_id", shopId).not("cumpleaños", "is", null).limit(100),
      admin.from("vouchers").select("id, gifted_to_name, service_name, created_at").eq("shop_id", shopId).eq("status", "sent").gte("created_at", todayStartIso).lte("created_at", todayEndIso).order("created_at", { ascending: false }).limit(10),
      admin.from("user_profiles").select("user_id, name, role, created_at").eq("shop_id", shopId).in("role", ["owner", "staff"]).gte("created_at", weekAgoIso).order("created_at", { ascending: false }).limit(10),
      admin.from("shops").select("plan_expiry").eq("id", shopId).single(),
      admin.from("appointments").select("id, start_time, customers(nombre)").eq("shop_id", shopId).in("status", ["confirmed", "in_progress"]).gte("start_time", todayStartIso).lte("start_time", todayEndIso).order("start_time", { ascending: true }).limit(100),
      admin.from("shops").select("business_hours").eq("id", shopId).single(),
      admin.from("pending_bookings").select("id, customer_name, start_time, payment_amount", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "pending").eq("payment_method", "bank_transfer").gt("expires_at", nowAr.toISOString()),
    ]);

    const items: DashboardNotification[] = [];

    if (todayApptsRes.data && todayApptsRes.data.length > 0) {
      for (const apt of todayApptsRes.data) {
        const c = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
        if (!c?.nombre) continue;
        items.push({ id: `nuevo_turno-${apt.id}`, type: "nuevo_turno", category: "info", title: "Nuevo turno agendado", description: `${c.nombre} tiene turno hoy a las ${formatTime(apt.start_time)}`, href: "/dashboard/calendar", timestamp: apt.start_time });
      }
    }

    if (cancelledRes.data && cancelledRes.data.length > 0) {
      for (const apt of cancelledRes.data) {
        const c = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
        items.push({ id: `turno_cancelado-${apt.id}`, type: "turno_cancelado", category: "urgent", title: "Turno cancelado", description: c?.nombre ? `${c.nombre} canceló su turno de las ${formatTime(apt.start_time)}` : `Un turno fue cancelado para las ${formatTime(apt.start_time)}`, href: "/dashboard/calendar", timestamp: apt.start_time });
      }
    }

    if (loyaltyRes.data && loyaltyRes.data.length > 0) {
      for (const c of loyaltyRes.data) {
        items.push({ id: `recompensa-${c.id}`, type: "recompensa_disponible", category: "action", title: "Recompensa disponible", description: `${c.nombre} tiene ${c.loyalty_rewards_available} recompensa(s) pendiente(s)`, href: "/dashboard/customers", timestamp: nowAr.toISOString() });
      }
    }

    if (customersRes.data && customersRes.data.length > 0) {
      const customersData = customersRes.data as any[];
      for (const c of customersData) {
        const cumple = c.cumpleaños;
        if (!cumple || !isBirthdayThisWeek(cumple, nowAr)) continue;
        const isToday = (() => { try { const d = new Date(cumple); return d.getMonth() === nowAr.getMonth() && d.getDate() === nowAr.getDate(); } catch { return false; } })();
        items.push({ id: `cumple-${c.id}`, type: "cliente_cumpleaños", category: "action", title: isToday ? "¡Hoy cumple años!" : "Cumpleaños esta semana", description: `${c.nombre} ${isToday ? "cumple años hoy" : "cumple años esta semana"}`, href: "/dashboard/customers", timestamp: nowAr.toISOString() });
      }
    }

    if (stockCountRes.count && stockCountRes.count > 0) {
      items.push({ id: "stock-bajo", type: "stock_bajo", category: "urgent", title: "Stock bajo", description: `${stockCountRes.count} producto(s) tienen stock bajo (menos de 5 unidades)`, href: "/dashboard/inventory", timestamp: nowAr.toISOString() });
    }

    if (staffRes.data && staffRes.data.length > 0) {
      for (const s of staffRes.data) {
        items.push({ id: `nuevo-miembro-${s.user_id}`, type: "nuevo_miembro", category: "info", title: "Nuevo miembro del equipo", description: `${s.name || "Nuevo miembro"} se unió como ${s.role === "owner" ? "dueño" : "staff"}`, href: "/dashboard/staff", timestamp: s.created_at ?? "" });
      }
    }

    const seasonalMessage = seasonalMomentLabel(nowAr);
    if (seasonalMessage) {
      items.push({ id: "oportunidad-estacional", type: "oportunidad_estacional", category: "info", title: "Fecha importante detectada", description: seasonalMessage, href: "/dashboard/business", timestamp: nowAr.toISOString() });
    }

    if (vouchersRes.data && vouchersRes.data.length > 0) {
      for (const v of vouchersRes.data) {
        items.push({ id: `voucher-enviado-${v.id}`, type: "voucher_enviado", category: "action", title: "Voucher enviado", description: `Voucher de ${v.service_name || "servicio"} enviado a ${v.gifted_to_name}`, href: "/dashboard/fidelizacion", timestamp: v.created_at });
      }
    }

    if (shopRes.data?.plan_expiry) {
      const planExpiry = new Date(shopRes.data.plan_expiry);
      const daysUntilExpiry = Math.ceil((planExpiry.getTime() - nowAr.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
        items.push({ id: "plan-por-vencer", type: "plan_por_vencer", category: "urgent", title: "Plan por vencer", description: `Tu plan vence en ${daysUntilExpiry} día(s). Renová para seguir operando.`, href: "/dashboard/billing", timestamp: planExpiry.toISOString() });
      }
    }

    if (bankTransfersRes.count && bankTransfersRes.count > 0) {
      items.push({ id: "bank-transfers-pending", type: "transferencia_pendiente", category: "urgent", title: "Transferencia pendiente", description: `${bankTransfersRes.count} transferencia(s) esperando confirmación`, href: "/dashboard/bank-transfers", timestamp: nowAr.toISOString() });
    }

    let shouldShowPending = false;
    if (businessHoursRes.data?.business_hours) {
      const hours = businessHoursRes.data.business_hours as Record<string, { open: boolean; end: string }>;
      const dayName = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
        weekday: "long",
      }).format(new Date()).toLowerCase();
      const todayHours = hours[dayName];
      if (todayHours?.open && todayHours.end) {
        const closingMinutes = minutesFromHHmm(todayHours.end);
        const currentMinutes = getArgentinaMinutesSinceMidnight(new Date());
        shouldShowPending = currentMinutes >= closingMinutes;
      }
    }

    const pendingComplete = shouldShowPending
      ? (pendingCompleteRes.data ?? []).map((apt) => {
          const c = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
          return { id: apt.id, customer_name: c?.nombre || "Cliente", start_time: apt.start_time };
        })
      : [];

    return NextResponse.json({
      items,
      pendingComplete,
      urgentAppointments: (urgentRes.count || 0) > 0,
      lowStock: (stockCountRes.count || 0) > 0,
      pendingTransfers: bankTransfersRes.count || 0,
    }, { status: 200 });
  } catch (e) {
    console.error("Error en notificaciones:", e);
    return NextResponse.json({ items: [], pendingComplete: [], urgentAppointments: false, lowStock: false, pendingTransfers: 0 }, { status: 200 });
  }
}
