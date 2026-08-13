import crypto from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { createLogContext, logInfo, logError } from "@/lib/api-logger";
import { autoCompletePastAppointments } from "@/lib/dashboard/appointments/mutations";

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
  const log = createLogContext("GET", "/api/cron/auto-complete-appointments");

  if (!(await verifyCron(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = await createServiceRoleClient();

    const { data: shops, error: selectError } = await admin
      .from("shops")
      .select("id")
      .eq("active", true);

    if (selectError) {
      return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
    }

    const shopIds = (shops ?? []).map((s) => s.id);
    if (shopIds.length === 0) {
      logInfo(log, "No active shops");
      return NextResponse.json({ ok: true, processed: 0, completed: 0, flagged: 0, confirmed: 0 });
    }

    let totalCompleted = 0;
    let totalConfirmed = 0;
    let totalFlagged = 0;

    for (const shopId of shopIds) {
      const result = await autoCompletePastAppointments(shopId);
      if (!result.success) {
        logError(log, `Auto-complete failed for shop ${shopId}`, new Error(result.error));
        continue;
      }
      totalCompleted += result.data?.completed ?? 0;
      totalConfirmed += result.data?.confirmed ?? 0;
      totalFlagged += result.data?.flagged ?? 0;
    }

    logInfo(log, `Auto-complete finished`, {
      shops: shopIds.length,
      completed: totalCompleted,
      confirmed: totalConfirmed,
      flagged: totalFlagged,
    });

    return NextResponse.json({
      ok: true,
      processed: shopIds.length,
      completed: totalCompleted,
      confirmed: totalConfirmed,
      flagged: totalFlagged,
    });
  } catch (error) {
    logError(log, "Auto-complete cron failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_failed" },
      { status: 500 }
    );
  }
}
