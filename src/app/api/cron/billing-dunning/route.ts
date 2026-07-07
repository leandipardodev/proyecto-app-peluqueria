import crypto from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  sendDunning7Days,
  sendDunning3Days,
  sendDunning1Day,
  sendDunningExpired,
  sendDunningGraceLastDay,
} from "@/lib/email/dunning-emails";

type ShopWithOwner = {
  id: string;
  nombre: string;
  slug: string;
  plan_expiry: string;
  owner_email: string;
};

async function verifyCron(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || !auth) return false;
  const expected = `Bearer ${secret}`;
  const actual = auth;
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export async function GET(request: Request) {
  if (!(await verifyCron(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = await createServiceRoleClient();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const { data: activeShops, error: selectError } = await admin
      .from("shops")
      .select("id, nombre, slug, plan_expiry")
      .eq("active", true)
      .not("plan_expiry", "is", null);

    if (selectError) {
      return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
    }

    if (!activeShops || activeShops.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const shopIds = activeShops.map((s) => s.id);

    const { data: memberships } = await admin
      .from("shop_memberships")
      .select("shop_id, user_id")
      .eq("is_active", true)
      .eq("role", "owner")
      .in("shop_id", shopIds);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const ownerUserIds = [...new Set(memberships.map((m) => m.user_id))];
    const userIdToShopId = new Map(memberships.map((m) => [m.user_id, m.shop_id]));

    const { data: profiles } = await admin
      .from("user_profiles")
      .select("user_id, email")
      .in("user_id", ownerUserIds);

    if (!profiles) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const emailByShopId = new Map<string, string>();
    for (const profile of profiles) {
      if (profile.email) {
        const shopId = userIdToShopId.get(profile.user_id);
        if (shopId) emailByShopId.set(shopId, profile.email);
      }
    }

    const shops: ShopWithOwner[] = [];
    for (const shop of activeShops) {
      const email = emailByShopId.get(shop.id);
      if (email && shop.plan_expiry) {
        shops.push({
          id: shop.id,
          nombre: shop.nombre,
          slug: shop.slug,
          plan_expiry: shop.plan_expiry,
          owner_email: email,
        });
      }
    }

    const { data: recentEvents } = await admin
      .from("shop_billing_events")
      .select("shop_id, event_type, created_at")
      .in("event_type", [
        "dunning_7_days",
        "dunning_3_days",
        "dunning_1_day",
        "dunning_expired",
        "dunning_grace_last_day",
      ])
      .in("shop_id", shopIds)
      .order("created_at", { ascending: false });

    const lastEventByShop = new Map<string, { event_type: string; created_at: string }>();
    for (const event of recentEvents || []) {
      if (!lastEventByShop.has(event.shop_id)) {
        lastEventByShop.set(event.shop_id, event);
      }
    }

    function hasEventToday(shopId: string, eventType: string): boolean {
      const last = lastEventByShop.get(shopId);
      if (!last || last.event_type !== eventType) return false;
      const lastDate = new Date(last.created_at).toISOString().slice(0, 10);
      return lastDate === new Date().toISOString().slice(0, 10);
    }

    let sent = 0;

    for (const shop of shops) {
      const expiryMs = new Date(shop.plan_expiry).getTime();
      if (Number.isNaN(expiryMs)) continue;

      const diffDays = Math.ceil((expiryMs - now) / dayMs);
      const graceEndMs = expiryMs + 2 * dayMs;

      try {
        if (diffDays === 7 && !hasEventToday(shop.id, "dunning_7_days")) {
          await sendDunning7Days({ to: shop.owner_email, shopName: shop.nombre, shopSlug: shop.slug, daysRemaining: 7 });
          await logDunningEvent(admin, shop.id, "dunning_7_days", { daysRemaining: 7 });
          sent++;
        } else if (diffDays === 3 && !hasEventToday(shop.id, "dunning_3_days")) {
          await sendDunning3Days({ to: shop.owner_email, shopName: shop.nombre, shopSlug: shop.slug, daysRemaining: 3 });
          await logDunningEvent(admin, shop.id, "dunning_3_days", { daysRemaining: 3 });
          sent++;
        } else if (diffDays === 1 && !hasEventToday(shop.id, "dunning_1_day")) {
          await sendDunning1Day({ to: shop.owner_email, shopName: shop.nombre, shopSlug: shop.slug, daysRemaining: 1 });
          await logDunningEvent(admin, shop.id, "dunning_1_day", { daysRemaining: 1 });
          sent++;
        } else if (diffDays <= 0 && diffDays > -2 && now < graceEndMs && !hasEventToday(shop.id, "dunning_expired")) {
          await sendDunningExpired({ to: shop.owner_email, shopName: shop.nombre, shopSlug: shop.slug, daysRemaining: 0 });
          await logDunningEvent(admin, shop.id, "dunning_expired", { daysRemaining: 0 });
          sent++;
        } else if (diffDays <= -1 && now >= graceEndMs - dayMs && now < graceEndMs && !hasEventToday(shop.id, "dunning_grace_last_day")) {
          await sendDunningGraceLastDay({ to: shop.owner_email, shopName: shop.nombre, shopSlug: shop.slug, daysRemaining: -1 });
          await logDunningEvent(admin, shop.id, "dunning_grace_last_day", { daysRemaining: -1 });
          sent++;
        }
      } catch (emailErr) {
        console.error(`[billing-dunning] Failed to send to shop ${shop.id}:`, emailErr);
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    console.error("[billing-dunning] error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_failed" },
      { status: 500 }
    );
  }
}

async function logDunningEvent(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  shopId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  await admin.from("shop_billing_events").insert({
    shop_id: shopId,
    actor_user_id: null,
    event_type: eventType,
    payload: payload as Json,
  });
}
