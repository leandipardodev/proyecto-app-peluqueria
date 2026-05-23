import { NextResponse } from "next/server";
import { syncReferralLedgerInternal } from "@/lib/admin/referrals";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";

async function handleCron(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncReferralLedgerInternal();

    const admin = await createServiceRoleClient();
    await admin.from("admin_audit_logs").insert({
      actor_user_id: null,
      action: "referrals.sync_ledger.cron",
      target_type: "referrals",
      target_id: null,
      payload: {
        inserted: result.inserted,
        executed_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ ok: true, inserted: result.inserted });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
