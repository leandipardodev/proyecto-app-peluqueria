import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, getShopId } from "@/lib/dashboard/auth-server";
import { getArgentinaDateString } from "@/lib/argentina-time";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const authUser = (await supabase.auth.getUser()).data?.user;
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createServiceRoleClient();
    const [shopId, managedShops] = await Promise.all([getShopId({ user: { id: authUser.id } }), getManagedShops(admin, authUser.id)]);

    const currentShop = shopId ? managedShops.find((s) => s.id === shopId) : managedShops[0] || null;
    const shopName = currentShop?.nombre || "Mi Peluqueria";
    const userName = authUser.email || "Usuario";

    const billingStatus = getSelectedShopBilling(managedShops, currentShop?.slug ?? null);

    return NextResponse.json(
      {
        shopName,
        userName,
        managedShops,
        billingStatus,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        shopName: "Mi Peluqueria",
        userName: "Usuario",
        managedShops: [],
        billingStatus: { daysRemaining: null, graceDaysRemaining: null, isExpired: false, inGrace: false },
      },
      { status: 200 },
    );
  }
}

async function getManagedShops(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
): Promise<Array<{ id: string; slug: string; nombre: string; active: boolean | null; plan_expiry: string | null }>> {
  const { data: memberships } = await admin.from("shop_memberships").select("shop_id").eq("user_id", userId).eq("is_active", true);

  const shopIds = (memberships || []).map((m) => m.shop_id).filter(Boolean);
  if (shopIds.length === 0) return [];

  const { data: shops } = await admin
    .from("shops")
    .select("id, slug, nombre, active, plan_expiry")
    .in("id", shopIds)
    .order("nombre", { ascending: true });

  return (shops || [])
    .filter((s) => !!s.slug)
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      nombre: s.nombre || "Local",
      active: s.active,
      plan_expiry: s.plan_expiry,
    }));
}

function getSelectedShopBilling(
  managedShops: Array<{ id: string; slug: string; nombre: string; active: boolean | null; plan_expiry: string | null }>,
  activeShopSlug: string | null,
): { daysRemaining: number | null; graceDaysRemaining: number | null; isExpired: boolean; inGrace: boolean } {
  const selected = (activeShopSlug ? managedShops.find((shop) => shop.slug === activeShopSlug) : null) || managedShops[0] || null;
  if (!selected?.plan_expiry) {
    return { daysRemaining: null, graceDaysRemaining: null, isExpired: false, inGrace: false };
  }

  const todayAr = getArgentinaDateString();
  const expiryAr = formatDateInArgentina(selected.plan_expiry);
  const daysRemaining = diffDays(expiryAr, todayAr);

  const graceUntil = addDays(expiryAr, 2);
  const graceDaysRemaining = diffDays(graceUntil, todayAr);
  const isExpired = daysRemaining <= 0;
  const inGrace = isExpired && graceDaysRemaining > 0;

  return {
    daysRemaining,
    graceDaysRemaining,
    isExpired,
    inGrace,
  };
}

function formatDateInArgentina(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function diffDays(target: string, source: string): number {
  const [ty, tm, td] = target.split("-").map(Number);
  const [sy, sm, sd] = source.split("-").map(Number);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  const sourceUtc = Date.UTC(sy, sm - 1, sd);
  return Math.floor((targetUtc - sourceUtc) / (24 * 60 * 60 * 1000));
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
