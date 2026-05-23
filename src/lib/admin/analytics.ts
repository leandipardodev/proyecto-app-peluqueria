import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { BILLING_PRICES } from "@/lib/billing/plans";
import { INDUSTRIES, type Industry } from "@/lib/industry/types";
import { resolveIndustry } from "@/lib/industry/resolve";

type ShopRow = {
  id: string;
  nombre: string | null;
  slug: string | null;
  created_at: string;
  industry: string | null;
  active: boolean | null;
  plan_expiry: string | null;
};

type BillingEventRow = {
  id: string;
  shop_id: string;
  created_at: string;
  payload: { cycle?: string | null } | null;
};

type AppointmentRow = {
  shop_id: string;
  created_at: string;
  status: string;
};

type SimpleShopRef = {
  shop_id: string;
};

type MembershipRow = {
  shop_id: string;
  role: string;
  is_active: boolean;
};

export type IndustryMetric = {
  industry: Industry;
  shopsCreated30d: number;
  totalShops: number;
  activeShops: number;
  inactiveShops: number;
  payments30d: number;
  revenue30d: number;
  arpu30d: number;
  churnRiskShops: number;
  conversionToFirstPaymentPct: number;
  avgDaysToFirstPayment: number | null;
};

export type ShopInsight = {
  shopId: string;
  shopName: string;
  shopSlug: string;
  industry: Industry;
  active: boolean;
  daysToExpiry: number | null;
  payments30d: number;
  revenue30d: number;
  appointments30d: number;
  completedAppointments30d: number;
  servicesCount: number;
  customersCount: number;
  staffCount: number;
};

export type TrendWindow = {
  windowDays: 7 | 30 | 90;
  shopsCreated: number;
  payments: number;
  revenue: number;
  appointments: number;
  completedAppointments: number;
  shopsCreatedPrevWindow: number;
  paymentsPrevWindow: number;
  revenuePrevWindow: number;
  appointmentsPrevWindow: number;
  completedAppointmentsPrevWindow: number;
};

export type AdminAnalytics = {
  generatedAt: string;
  totals: {
    totalShops: number;
    activeShops: number;
    inactiveShops: number;
    shopsCreated7d: number;
    shopsCreated30d: number;
    shopsExpiring7d: number;
    shopsExpiredOrInactive: number;
    payments30d: number;
    revenue30d: number;
    revenueAllTime: number;
    mrrEstimated: number;
    arpuActive30d: number;
    totalAppointments30d: number;
    completedAppointments30d: number;
    totalServices: number;
    totalCustomers: number;
    totalStaff: number;
  };
  byIndustry: IndustryMetric[];
  topShopsByRevenue30d: ShopInsight[];
  trends: TrendWindow[];
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function diffDays(targetIso: string, from: Date): number {
  const t = new Date(targetIso).getTime();
  const f = from.getTime();
  return Math.ceil((t - f) / (1000 * 60 * 60 * 24));
}

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const admin = await createServiceRoleClient();
  const now = new Date();
  const iso7d = daysAgoIso(7);
  const iso30d = daysAgoIso(30);
  const iso90d = daysAgoIso(90);

  const [{ data: shopsRaw }, { data: appliedEventsRaw }, { data: appointmentsRaw }, { data: servicesRaw }, { data: customersRaw }, { data: membershipsRaw }] = await Promise.all([
    admin.from("shops").select("id, nombre, slug, created_at, industry, active, plan_expiry"),
    admin
      .from("shop_billing_events")
      .select("id, shop_id, created_at, payload")
      .eq("event_type", "subscription_payment_applied"),
    admin.from("appointments").select("shop_id, created_at, status").gte("created_at", iso90d),
    admin.from("services").select("shop_id"),
    admin.from("customers").select("shop_id"),
    admin.from("shop_memberships").select("shop_id, role, is_active").eq("is_active", true).in("role", ["owner", "admin", "staff"]),
  ]);

  const shops = (shopsRaw || []) as ShopRow[];
  const appliedEvents = (appliedEventsRaw || []) as BillingEventRow[];
  const appointments = (appointmentsRaw || []) as AppointmentRow[];
  const services = (servicesRaw || []) as SimpleShopRef[];
  const customers = (customersRaw || []) as SimpleShopRef[];
  const memberships = (membershipsRaw || []) as MembershipRow[];

  const eventsByShop = new Map<string, BillingEventRow[]>();
  for (const event of appliedEvents) {
    const bucket = eventsByShop.get(event.shop_id) || [];
    bucket.push(event);
    eventsByShop.set(event.shop_id, bucket);
  }

  const nowIso = now.toISOString();
  const isActiveByExpiry = (planExpiry: string | null) => {
    if (!planExpiry) return false;
    const exp = new Date(planExpiry);
    return exp.toISOString() >= nowIso;
  };

  const totalShops = shops.length;
  const activeShops = shops.filter((s) => Boolean(s.active) && isActiveByExpiry(s.plan_expiry)).length;
  const inactiveShops = totalShops - activeShops;
  const shopsCreated7d = shops.filter((s) => s.created_at >= iso7d).length;
  const shopsCreated30d = shops.filter((s) => s.created_at >= iso30d).length;
  const shopsExpiring7d = shops.filter((s) => {
    if (!s.plan_expiry || !Boolean(s.active)) return false;
    const days = diffDays(s.plan_expiry, now);
    return days >= 0 && days <= 7;
  }).length;
  const shopsExpiredOrInactive = shops.filter((s) => !Boolean(s.active) || !isActiveByExpiry(s.plan_expiry)).length;

  const payments30d = appliedEvents.filter((e) => e.created_at >= iso30d).length;
  const monthlyPrice = BILLING_PRICES.monthly;
  const revenue30d = payments30d * monthlyPrice;
  const revenueAllTime = appliedEvents.length * monthlyPrice;
  const mrrEstimated = activeShops * monthlyPrice;
  const arpuActive30d = activeShops > 0 ? Number((revenue30d / activeShops).toFixed(2)) : 0;

  const servicesByShop = new Map<string, number>();
  for (const row of services) servicesByShop.set(row.shop_id, (servicesByShop.get(row.shop_id) || 0) + 1);
  const customersByShop = new Map<string, number>();
  for (const row of customers) customersByShop.set(row.shop_id, (customersByShop.get(row.shop_id) || 0) + 1);
  const staffByShop = new Map<string, number>();
  for (const row of memberships) staffByShop.set(row.shop_id, (staffByShop.get(row.shop_id) || 0) + 1);

  const appointmentsByShop = new Map<string, AppointmentRow[]>();
  for (const appt of appointments) {
    const list = appointmentsByShop.get(appt.shop_id) || [];
    list.push(appt);
    appointmentsByShop.set(appt.shop_id, list);
  }
  const totalAppointments30d = appointments.length;
  const completedAppointments30d = appointments.filter((a) => a.status === "completed").length;
  const totalServices = services.length;
  const totalCustomers = customers.length;
  const totalStaff = memberships.length;

  const trendWindows: Array<7 | 30 | 90> = [7, 30, 90];
  const trends: TrendWindow[] = trendWindows.map((windowDays) => {
    const currentIso = daysAgoIso(windowDays);
    const previousIso = daysAgoIso(windowDays * 2);

    const shopsCreatedCurrent = shops.filter((s) => s.created_at >= currentIso).length;
    const shopsCreatedPrev = shops.filter((s) => s.created_at >= previousIso && s.created_at < currentIso).length;

    const paymentsCurrent = appliedEvents.filter((e) => e.created_at >= currentIso).length;
    const paymentsPrev = appliedEvents.filter((e) => e.created_at >= previousIso && e.created_at < currentIso).length;

    const appointmentsCurrentRows = appointments.filter((a) => a.created_at >= currentIso);
    const appointmentsPrevRows = appointments.filter((a) => a.created_at >= previousIso && a.created_at < currentIso);

    const completedCurrent = appointmentsCurrentRows.filter((a) => a.status === "completed").length;
    const completedPrev = appointmentsPrevRows.filter((a) => a.status === "completed").length;

    return {
      windowDays,
      shopsCreated: shopsCreatedCurrent,
      payments: paymentsCurrent,
      revenue: paymentsCurrent * monthlyPrice,
      appointments: appointmentsCurrentRows.length,
      completedAppointments: completedCurrent,
      shopsCreatedPrevWindow: shopsCreatedPrev,
      paymentsPrevWindow: paymentsPrev,
      revenuePrevWindow: paymentsPrev * monthlyPrice,
      appointmentsPrevWindow: appointmentsPrevRows.length,
      completedAppointmentsPrevWindow: completedPrev,
    };
  });

  const byIndustry: IndustryMetric[] = INDUSTRIES.map((industry) => {
    const shopsInIndustry = shops.filter((s) => resolveIndustry(s.industry) === industry);
    const shopIds = new Set(shopsInIndustry.map((s) => s.id));
    const eventsIndustry = appliedEvents.filter((e) => shopIds.has(e.shop_id));
    const events30dIndustry = eventsIndustry.filter((e) => e.created_at >= iso30d);

    const shopsCreated30dIndustry = shopsInIndustry.filter((s) => s.created_at >= iso30d).length;
    const activeShopsIndustry = shopsInIndustry.filter((s) => Boolean(s.active) && isActiveByExpiry(s.plan_expiry)).length;
    const inactiveShopsIndustry = shopsInIndustry.length - activeShopsIndustry;
    const churnRiskShops = shopsInIndustry.filter((s) => {
      if (!s.plan_expiry || !Boolean(s.active)) return true;
      const days = diffDays(s.plan_expiry, now);
      return days < 0 || days <= 7;
    }).length;

    const paidShops = shopsInIndustry.filter((s) => (eventsByShop.get(s.id) || []).length > 0);
    const conversion = shopsInIndustry.length > 0 ? (paidShops.length / shopsInIndustry.length) * 100 : 0;

    const daysToFirstPayment: number[] = [];
    for (const shop of paidShops) {
      const shopEvents = (eventsByShop.get(shop.id) || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const firstPayment = shopEvents[0];
      if (!firstPayment) continue;
      const createdAt = new Date(shop.created_at).getTime();
      const firstPaidAt = new Date(firstPayment.created_at).getTime();
      if (Number.isFinite(createdAt) && Number.isFinite(firstPaidAt) && firstPaidAt >= createdAt) {
        const days = Math.floor((firstPaidAt - createdAt) / (1000 * 60 * 60 * 24));
        daysToFirstPayment.push(days);
      }
    }

    const avgDaysToFirstPayment =
      daysToFirstPayment.length > 0
        ? Number((daysToFirstPayment.reduce((acc, item) => acc + item, 0) / daysToFirstPayment.length).toFixed(1))
        : null;

    return {
      industry,
      shopsCreated30d: shopsCreated30dIndustry,
      totalShops: shopsInIndustry.length,
      activeShops: activeShopsIndustry,
      inactiveShops: inactiveShopsIndustry,
      payments30d: events30dIndustry.length,
      revenue30d: events30dIndustry.length * monthlyPrice,
      arpu30d: activeShopsIndustry > 0 ? Number(((events30dIndustry.length * monthlyPrice) / activeShopsIndustry).toFixed(2)) : 0,
      churnRiskShops,
      conversionToFirstPaymentPct: Number(conversion.toFixed(1)),
      avgDaysToFirstPayment,
    };
  });

  const events30dByShop = new Map<string, number>();
  for (const event of appliedEvents) {
    if (event.created_at < iso30d) continue;
    events30dByShop.set(event.shop_id, (events30dByShop.get(event.shop_id) || 0) + 1);
  }

  const topShopsByRevenue30d: ShopInsight[] = shops
    .map((shop) => {
      const industry = resolveIndustry(shop.industry);
      const active = Boolean(shop.active) && isActiveByExpiry(shop.plan_expiry);
      const payments = events30dByShop.get(shop.id) || 0;
      const appts = appointmentsByShop.get(shop.id) || [];
      return {
        shopId: shop.id,
        shopName: shop.nombre || "Local",
        shopSlug: shop.slug || "-",
        industry,
        active,
        daysToExpiry: shop.plan_expiry ? diffDays(shop.plan_expiry, now) : null,
        payments30d: payments,
        revenue30d: payments * monthlyPrice,
        appointments30d: appts.length,
        completedAppointments30d: appts.filter((a) => a.status === "completed").length,
        servicesCount: servicesByShop.get(shop.id) || 0,
        customersCount: customersByShop.get(shop.id) || 0,
        staffCount: staffByShop.get(shop.id) || 0,
      };
    })
    .sort((a, b) => b.revenue30d - a.revenue30d)
    .slice(0, 15);

  return {
    generatedAt: now.toISOString(),
    totals: {
      totalShops,
      activeShops,
      inactiveShops,
      shopsCreated7d,
      shopsCreated30d,
      shopsExpiring7d,
      shopsExpiredOrInactive,
      payments30d,
      revenue30d,
      revenueAllTime,
      mrrEstimated,
      arpuActive30d,
      totalAppointments30d,
      completedAppointments30d,
      totalServices,
      totalCustomers,
      totalStaff,
    },
    byIndustry,
    topShopsByRevenue30d,
    trends,
  };
}
