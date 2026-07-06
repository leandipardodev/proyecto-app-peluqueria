import { createServiceRoleClient } from "@/lib/dashboard/auth/server";

type ProductEventRow = {
  shop_id: string;
  event_type: string;
  occurred_at: string;
};

type ShopRow = {
  id: string;
  created_at: string;
};

export type GrowthMetrics = {
  generatedAt: string;
  lookbackDays: number;
  cohort: {
    trialStarted: number;
    paid: number;
  };
  activation: {
    activatedD7: number;
    activationRateD7Pct: number;
  };
  retention: {
    paidShops30d: number;
    churnedShops30d: number;
    churnRate30dPct: number;
  };
  conversion: {
    trialToPaid: number;
    trialToPaidPct: number;
  };
  funnel: {
    trial_started: number;
    first_staff_added: number;
    first_service_published: number;
    first_booking_confirmed: number;
    subscription_paid: number;
  };
};

function daysAgoIso(days: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString();
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function earliestByType(events: ProductEventRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of events) {
    const key = row.event_type;
    const prev = map.get(key);
    if (!prev || row.occurred_at < prev) {
      map.set(key, row.occurred_at);
    }
  }
  return map;
}

export async function fetchGrowthMetrics(lookbackDays = 90): Promise<GrowthMetrics> {
  const admin = await createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const lookbackIso = daysAgoIso(lookbackDays);
  const iso30d = daysAgoIso(30);
  const eventsToFetch = [
    "trial_started",
    "first_staff_added",
    "first_service_published",
    "first_booking_confirmed",
    "subscription_paid",
    "subscription_canceled",
  ];

  const [{ data: eventsRaw, error: eventsError }, { data: shopsRaw, error: shopsError }] = await Promise.all([
    admin
      .from("product_events")
      .select("shop_id, event_type, occurred_at")
      .in("event_type", eventsToFetch)
      .gte("occurred_at", lookbackIso),
    admin.from("shops").select("id, created_at").gte("created_at", lookbackIso),
  ]);

  if (eventsError) {
    throw new Error(eventsError.message);
  }
  if (shopsError) {
    throw new Error(shopsError.message);
  }

  const events = (eventsRaw || []) as ProductEventRow[];
  const shops = (shopsRaw || []) as ShopRow[];

  const eventMapByShop = new Map<string, ProductEventRow[]>();
  for (const event of events) {
    const list = eventMapByShop.get(event.shop_id) || [];
    list.push(event);
    eventMapByShop.set(event.shop_id, list);
  }

  let activatedD7 = 0;
  let trialToPaid = 0;

  const trialStartedShops = new Set<string>();
  const staffShops = new Set<string>();
  const serviceShops = new Set<string>();
  const bookingConfirmedShops = new Set<string>();
  const subscriptionPaidShops = new Set<string>();

  for (const shop of shops) {
    const shopEvents = eventMapByShop.get(shop.id) || [];
    const byType = earliestByType(shopEvents);

    const trialStartedAt = byType.get("trial_started");
    const firstBookingConfirmedAt = byType.get("first_booking_confirmed");
    const subscriptionPaidAt = byType.get("subscription_paid");
    const firstStaffAddedAt = byType.get("first_staff_added");
    const firstServicePublishedAt = byType.get("first_service_published");

    if (trialStartedAt) trialStartedShops.add(shop.id);
    if (firstStaffAddedAt) staffShops.add(shop.id);
    if (firstServicePublishedAt) serviceShops.add(shop.id);
    if (firstBookingConfirmedAt) bookingConfirmedShops.add(shop.id);
    if (subscriptionPaidAt) subscriptionPaidShops.add(shop.id);

    if (trialStartedAt && firstBookingConfirmedAt) {
      const deltaMs = new Date(firstBookingConfirmedAt).getTime() - new Date(trialStartedAt).getTime();
      if (deltaMs >= 0 && deltaMs <= 7 * 24 * 60 * 60 * 1000) {
        activatedD7 += 1;
      }
    }

    if (trialStartedAt && subscriptionPaidAt && subscriptionPaidAt >= trialStartedAt) {
      trialToPaid += 1;
    }
  }

  const paidEvents30d = events.filter((row) => row.event_type === "subscription_paid" && row.occurred_at >= iso30d);
  const canceledEvents30d = events.filter((row) => row.event_type === "subscription_canceled" && row.occurred_at >= iso30d);
  const paidShops30d = new Set(paidEvents30d.map((row) => row.shop_id));
  const churnedShops30d = new Set(canceledEvents30d.map((row) => row.shop_id));

  return {
    generatedAt: nowIso,
    lookbackDays,
    cohort: {
      trialStarted: trialStartedShops.size,
      paid: subscriptionPaidShops.size,
    },
    activation: {
      activatedD7,
      activationRateD7Pct: pct(activatedD7, trialStartedShops.size),
    },
    retention: {
      paidShops30d: paidShops30d.size,
      churnedShops30d: churnedShops30d.size,
      churnRate30dPct: pct(churnedShops30d.size, paidShops30d.size),
    },
    conversion: {
      trialToPaid,
      trialToPaidPct: pct(trialToPaid, trialStartedShops.size),
    },
    funnel: {
      trial_started: trialStartedShops.size,
      first_staff_added: staffShops.size,
      first_service_published: serviceShops.size,
      first_booking_confirmed: bookingConfirmedShops.size,
      subscription_paid: subscriptionPaidShops.size,
    },
  };
}
