import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = await createServiceRoleClient();
    const nowIso = new Date().toISOString();

    const { data: expiredShops, error: selectError } = await admin
      .from("shops")
      .select("id, plan_expiry")
      .eq("active", true)
      .not("plan_expiry", "is", null)
      .lte("plan_expiry", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());

    if (selectError) {
      return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
    }

    const shopIds = (expiredShops || []).map((shop) => shop.id);

    if (shopIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const { error: updateError } = await admin
      .from("shops")
      .update({ active: false, updated_at: nowIso })
      .in("id", shopIds);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    await admin.from("shop_billing_events").insert(
      shopIds.map((shopId) => ({
        shop_id: shopId,
        actor_user_id: null,
        event_type: "subscription_marked_inactive_by_cron",
        payload: {
          reason: "grace_period_expired",
          executed_at: nowIso,
        },
      }))
    );

    return NextResponse.json({ ok: true, updated: shopIds.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_failed" },
      { status: 500 }
    );
  }
}
