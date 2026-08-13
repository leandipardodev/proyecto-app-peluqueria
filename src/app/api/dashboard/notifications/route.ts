import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, getShopId } from "@/lib/dashboard/auth/server";
import { getArgentinaNow } from "@/lib/argentina-time";
import { APPOINTMENT_STATUS_NEEDS_CONFIRMATION } from "@/lib/dashboard/appointments/status";

export const dynamic = "force-dynamic";

type DashboardNotification = {
  id: string;
  type: string;
  category: "urgent" | "action" | "info";
  title: string;
  description: string;
  href: string;
  timestamp: string;
  isRead: boolean;
};

const EMPTY_RESPONSE = { items: [], urgentAppointments: false, lowStock: false, pendingTransfers: 0, pendingOrders: 0, unreadCount: 0 };

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

function isTodayInART(dateStr: string, now: Date): boolean {
  try {
    const d = new Date(dateStr);
    return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  } catch {
    return false;
  }
}

async function assureNotifications(admin: Awaited<ReturnType<typeof createServiceRoleClient>>, shopId: string) {
  const nowAr = getArgentinaNow();
  const nowIso = nowAr.toISOString();

  const [loyaltyRes, customersRes, shopRes] = await Promise.all([
    admin.from("customers").select("id, nombre, loyalty_rewards_available").eq("shop_id", shopId).gt("loyalty_rewards_available", 0).order("loyalty_rewards_available", { ascending: false }).limit(10),
    admin.from("customers").select("id, nombre, cumpleaños" as string).eq("shop_id", shopId).not("cumpleaños", "is", null).limit(100),
    admin.from("shops").select("plan_expiry").eq("id", shopId).single(),
  ]);

  // Recompensas: asegurar las que existen y borrar las que ya no aplican.
  const keepRewardKeys = (loyaltyRes.data ?? []).map((c) => `recompensa:${c.id}`);
  const rewardDelete = admin.from("notifications").delete().eq("shop_id", shopId).eq("type", "recompensa_disponible");
  if (keepRewardKeys.length > 0) rewardDelete.not("entity_key", "in", keepRewardKeys);
  await rewardDelete;
  if (loyaltyRes.data && loyaltyRes.data.length > 0) {
    const rows = loyaltyRes.data.map((c) => ({
      shop_id: shopId,
      type: "recompensa_disponible",
      category: "action" as const,
      title: "Recompensa disponible",
      description: `${c.nombre} tiene ${c.loyalty_rewards_available} recompensa(s) pendiente(s)`,
      href: "/dashboard/customers",
      entity_key: `recompensa:${c.id}`,
      created_at: nowIso,
    }));
    await admin.from("notifications").upsert(rows, { onConflict: "shop_id,entity_key" });
  }

  // Cumpleaños: una vez por año por cliente.
  if (customersRes.data && customersRes.data.length > 0) {
    const customersData = customersRes.data as unknown as { id: string; nombre: string; cumpleaños: string | null }[];
    const rows = [];
    for (const c of customersData) {
      const cumple = c.cumpleaños;
      if (!cumple || !isBirthdayThisWeek(cumple, nowAr)) continue;
      const isToday = isTodayInART(cumple, nowAr);
      rows.push({
        shop_id: shopId,
        type: "cliente_cumpleaños",
        category: "action" as const,
        title: isToday ? "¡Hoy cumple años!" : "Cumpleaños esta semana",
        description: `${c.nombre} ${isToday ? "cumple años hoy" : "cumple años esta semana"}`,
        href: "/dashboard/customers",
        entity_key: `cumple:${c.id}:${nowAr.getFullYear()}`,
        created_at: nowIso,
      });
    }
    if (rows.length > 0) {
      await admin.from("notifications").upsert(rows, { onConflict: "shop_id,entity_key", ignoreDuplicates: true });
    }
  }

  // Plan por vencer: se asegura si vence en <=7 días y se limpia si ya no aplica.
  const planRows = [];
  let planKey: string | null = null;
  if (shopRes.data?.plan_expiry) {
    const planExpiry = new Date(shopRes.data.plan_expiry);
    const daysUntilExpiry = Math.ceil((planExpiry.getTime() - nowAr.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
      planKey = "plan-por-vencer";
      planRows.push({
        shop_id: shopId,
        type: "plan_por_vencer",
        category: "urgent" as const,
        title: "Plan por vencer",
        description: `Tu plan vence en ${daysUntilExpiry} día(s). Renová para seguir operando.`,
        href: "/dashboard/billing",
        entity_key: planKey,
        created_at: nowIso,
      });
    }
  }
  if (planKey) {
    await admin.from("notifications").upsert(planRows, { onConflict: "shop_id,entity_key", ignoreDuplicates: true });
  } else {
    await admin.from("notifications").delete().eq("shop_id", shopId).eq("type", "plan_por_vencer");
  }

  // Oportunidad estacional: una por fecha.
  const seasonalMessage = seasonalMomentLabel(nowAr);
  if (seasonalMessage) {
    const mm = String(nowAr.getMonth() + 1).padStart(2, "0");
    const dd = String(nowAr.getDate()).padStart(2, "0");
    await admin.from("notifications").upsert([
      {
        shop_id: shopId,
        type: "oportunidad_estacional",
        category: "info" as const,
        title: "Fecha importante detectada",
        description: seasonalMessage,
        href: "/dashboard/business",
        entity_key: `estacional:${mm}-${dd}`,
        created_at: nowIso,
      },
    ], { onConflict: "shop_id,entity_key", ignoreDuplicates: true });
  }
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const authUser = (await supabase.auth.getUser()).data?.user;
    if (!authUser) {
      return NextResponse.json(EMPTY_RESPONSE, { status: 200 });
    }

    const shopId = await getShopId({ user: { id: authUser.id } });
    if (!shopId) {
      return NextResponse.json(EMPTY_RESPONSE, { status: 200 });
    }

    const admin = await createServiceRoleClient();
    const nowAr = getArgentinaNow();
    const oneHourFromNow = new Date(nowAr.getTime() + 60 * 60 * 1000).toISOString();

    await assureNotifications(admin, shopId);

    const [notifsRes, readsRes, urgentRes, stockCountRes, bankTransfersRes, ordersRes] = await Promise.all([
      admin.from("notifications").select("id, type, category, title, description, href, created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(50),
      admin.from("notification_reads").select("notification_id").eq("user_id", authUser.id),
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("shop_id", shopId).in("status", APPOINTMENT_STATUS_NEEDS_CONFIRMATION as unknown as string[]).gte("start_time", nowAr.toISOString()).lte("start_time", oneHourFromNow),
      admin.from("stock").select("id", { count: "exact", head: true }).eq("shop_id", shopId).lt("quantity", 5),
      admin.from("pending_bookings").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "pending").eq("payment_method", "bank_transfer").gt("expires_at", nowAr.toISOString()),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "pending_payment"),
    ]);

    const readSet = new Set((readsRes.data ?? []).map((r) => r.notification_id));

    const items: DashboardNotification[] = (notifsRes.data ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      category: (n.category === "urgent" || n.category === "action" || n.category === "info" ? n.category : "info") as DashboardNotification["category"],
      title: n.title,
      description: n.description,
      href: n.href,
      timestamp: n.created_at,
      isRead: readSet.has(n.id),
    }));

    return NextResponse.json({
      items,
      urgentAppointments: (urgentRes.count || 0) > 0,
      lowStock: (stockCountRes.count || 0) > 0,
      pendingTransfers: bankTransfersRes.count || 0,
      pendingOrders: ordersRes.count || 0,
      unreadCount: items.filter((i) => !i.isRead).length,
    }, { status: 200 });
  } catch (e) {
    console.error("Error en notificaciones:", e);
    return NextResponse.json(EMPTY_RESPONSE, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const authUser = (await supabase.auth.getUser()).data?.user;
    if (!authUser) {
      return NextResponse.json({ error: "SESION_EXPIRADA" }, { status: 401 });
    }

    const shopId = await getShopId({ user: { id: authUser.id } });
    if (!shopId) {
      return NextResponse.json({ error: "SESION_EXPIRADA" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
    const all = Boolean(body.all);
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
    if (!all && ids.length === 0) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }

    const admin = await createServiceRoleClient();
    let targetIds = ids;
    if (all) {
      const { data } = await admin.from("notifications").select("id").eq("shop_id", shopId);
      targetIds = (data ?? []).map((n) => n.id);
    }

    if (targetIds.length > 0) {
      await admin.from("notification_reads").upsert(
        targetIds.map((notificationId) => ({ user_id: authUser.id, notification_id: notificationId })),
        { onConflict: "user_id,notification_id" }
      );
    }

    const [{ data: notifs }, { data: reads }] = await Promise.all([
      admin.from("notifications").select("id").eq("shop_id", shopId),
      admin.from("notification_reads").select("notification_id").eq("user_id", authUser.id),
    ]);
    const readSet = new Set((reads ?? []).map((r) => r.notification_id));
    const unreadCount = (notifs ?? []).filter((n) => !readSet.has(n.id)).length;

    return NextResponse.json({ unreadCount }, { status: 200 });
  } catch (e) {
    console.error("Error al marcar notificaciones:", e);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
