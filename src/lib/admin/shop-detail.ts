"use server";

import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { getBillingPrice } from "@/lib/admin/site-settings";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";

export type ShopMember = {
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
};

export type ShopServiceItem = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number | null;
};

export type ShopAppointment = {
  id: string;
  customerName: string;
  serviceName: string;
  startTime: string;
  status: string;
  price: number;
};

export type ShopBillingEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  payload: Record<string, unknown> | null;
};

export type ShopSubscription = {
  id: string;
  status: string;
  preapprovalId: string;
  nextChargeDate: string | null;
  payerId: string;
  createdAt: string;
};

export type ShopMpLog = {
  id: string;
  eventType: string;
  mpPreferenceId: string | null;
  createdAt: string | null;
};

export type ShopDetail = {
  id: string;
  nombre: string;
  slug: string;
  industryLabel: string;
  active: boolean;
  planExpiry: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  address: string | null;
  localidad: string | null;
  phone: string | null;
  description: string | null;
  businessHours: unknown;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  googleMapsUrl: string | null;
  mpPublicKey: string | null;
  mpTokenConfigured: boolean;
  bankTransferEnabled: boolean;
  bankName: string | null;
  bankCvuCbu: string | null;
  bankAlias: string | null;
  payAtShop: boolean;
  bookingDepositEnabled: boolean;
  bookingDepositAmount: number;
  loyaltyEnabled: boolean;
  loyaltyCutsRequired: number;
  loyaltyDiscountPercent: number;
  ownerEmail: string | null;
  ownerName: string | null;
  members: ShopMember[];
  services: ShopServiceItem[];
  servicesCount: number;
  customersCount: number;
  staffCount: number;
  appointments30d: number;
  completedAppointments30d: number;
  recentAppointments: ShopAppointment[];
  revenue30d: number;
  billingEvents: ShopBillingEvent[];
  subscription: ShopSubscription | null;
  mpLogs: ShopMpLog[];
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function fetchShopDetail(
  shopId: string,
): Promise<ShopDetail | null> {
  await requireSuperAdmin();
  const admin = await createServiceRoleClient();
  const iso30d = daysAgoIso(30);

  const { data: shop } = await admin
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop) return null;

  const [
    { data: memberships },
    { data: services },
    { data: customersCountRes },
    { data: appointments30dRaw },
    { data: recentAppointmentsRaw },
    { data: billingEventsRaw },
    { data: subscription },
    { data: mpLogsRaw },
  ] = await Promise.all([
    admin
      .from("shop_memberships")
      .select("user_id, role")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"]),
    admin
      .from("services")
      .select("id, name, price, duration_minutes")
      .eq("shop_id", shopId),
    admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId),
    admin
      .from("appointments")
      .select("id, status, created_at")
      .eq("shop_id", shopId)
      .gte("created_at", iso30d),
    admin
      .from("appointments")
      .select(
        "id, start_time, status, service_price, customers(nombre), services(name)",
      )
      .eq("shop_id", shopId)
      .order("start_time", { ascending: false })
      .limit(10),
    admin
      .from("shop_billing_events")
      .select("id, event_type, created_at, payload")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("shop_subscriptions")
      .select(
        "id, status, preapproval_id, next_charge_date, payer_id, created_at",
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("mercadopago_logs")
      .select("id, event_type, mp_preference_id, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const memberRows = (memberships || []) as Array<{
    user_id: string;
    role: string;
  }>;

  const userIds = memberRows.map((m) => m.user_id);
  const profileMap = new Map<
    string,
    { email: string | null; name: string | null }
  >();

  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("user_id, email, name")
      .in("user_id", userIds);

    for (const p of profiles || []) {
      profileMap.set(p.user_id, {
        email: (p as { email?: string | null }).email ?? null,
        name: (p as { name?: string | null }).name ?? null,
      });
    }
  }

  const members: ShopMember[] = memberRows.map((m) => ({
    userId: m.user_id,
    email: profileMap.get(m.user_id)?.email || null,
    name: profileMap.get(m.user_id)?.name || null,
    role: m.role,
  }));

  const servicesList: ShopServiceItem[] = (services || []).map(
    (s: {
      id: string;
      name: string;
      price: number;
      duration_minutes: number | null;
    }) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      durationMinutes: s.duration_minutes,
    }),
  );

  const appt30d = (appointments30dRaw || []) as Array<{
    status: string;
  }>;
  const completed30d = appt30d.filter(
    (a) => a.status === "completed",
  ).length;

  const recentAppointments: ShopAppointment[] = (
    recentAppointmentsRaw || []
  ).map(
    (a: {
      id: string;
      start_time: string;
      status: string | null;
      service_price: number | null;
      customers: { nombre: string } | null;
      services: { name: string } | null;
    }) => ({
      id: a.id,
      customerName: a.customers?.nombre || "-",
      serviceName: a.services?.name || "-",
      startTime: a.start_time,
      status: a.status ?? "scheduled",
      price: a.service_price ?? 0,
    }),
  );

  const billingEvents: ShopBillingEvent[] = (billingEventsRaw || []).map(
    (e: {
      id: string;
      event_type: string;
      created_at: string;
      payload: unknown;
    }) => ({
      id: e.id,
      eventType: e.event_type,
      createdAt: e.created_at,
      payload:
        typeof e.payload === "object" && e.payload !== null
          ? (e.payload as Record<string, unknown>)
          : null,
    }),
  );

  const monthlyPrice = await getBillingPrice();
  const paymentEvents30d = billingEvents.filter(
    (e) =>
      e.eventType === "subscription_payment_applied" &&
      e.createdAt >= iso30d,
  ).length;
  const revenue30d = paymentEvents30d * monthlyPrice;

  const sub = subscription as
    | {
        id: string;
        status: string;
        preapproval_id: string;
        next_charge_date: string | null;
        payer_id: string;
        created_at: string;
      }
    | null;

  const subscriptionData: ShopSubscription | null = sub
    ? {
        id: sub.id,
        status: sub.status,
        preapprovalId: sub.preapproval_id,
        nextChargeDate: sub.next_charge_date,
        payerId: sub.payer_id,
        createdAt: sub.created_at,
      }
    : null;

  const mpLogs: ShopMpLog[] = (mpLogsRaw || []).map(
    (l: {
      id: string;
      event_type: string;
      mp_preference_id: string | null;
      created_at: string | null;
    }) => ({
      id: l.id,
      eventType: l.event_type,
      mpPreferenceId: l.mp_preference_id,
      createdAt: l.created_at,
    }),
  );

  const ownerMember = memberRows.find((m) => m.role === "owner");
  const ownerProfile = ownerMember
    ? profileMap.get(ownerMember.user_id)
    : null;

  const industry = resolveIndustry(shop.industry);

  return {
    id: shop.id,
    nombre: shop.nombre,
    slug: shop.slug,
    industryLabel: INDUSTRY_CONFIG[industry].displayName,
    active: shop.active ?? true,
    planExpiry: shop.plan_expiry,
    createdAt: shop.created_at,
    updatedAt: shop.updated_at,
    address: shop.address,
    localidad: shop.localidad,
    phone: shop.phone,
    description: shop.description,
    businessHours: shop.business_hours,
    instagramUrl: shop.instagram_url,
    facebookUrl: shop.facebook_url,
    tiktokUrl: shop.tiktok_url,
    googleMapsUrl: shop.google_maps_url,
    mpPublicKey: shop.mp_public_key,
    mpTokenConfigured: Boolean(shop.mp_access_token),
    bankTransferEnabled: shop.bank_transfer_enabled,
    bankName: shop.bank_name,
    bankCvuCbu: shop.bank_cvu_cbu,
    bankAlias: shop.bank_alias,
    payAtShop: shop.pay_at_shop,
    bookingDepositEnabled: shop.booking_deposit_enabled,
    bookingDepositAmount: shop.booking_deposit_amount,
    loyaltyEnabled: shop.loyalty_enabled,
    loyaltyCutsRequired: shop.loyalty_cuts_required,
    loyaltyDiscountPercent: shop.loyalty_discount_percent,
    ownerEmail: ownerProfile?.email || null,
    ownerName: ownerProfile?.name || null,
    members,
    services: servicesList,
    servicesCount: servicesList.length,
    customersCount: customersCountRes?.length ?? 0,
    staffCount: members.length,
    appointments30d: appt30d.length,
    completedAppointments30d: completed30d,
    recentAppointments,
    revenue30d,
    billingEvents,
    subscription: subscriptionData,
    mpLogs,
  };
}
