import crypto from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { createLogContext, logInfo, logError } from "@/lib/api-logger";

export async function GET(request: Request) {
  const log = createLogContext("GET", "/api/cron/bank-transfer-cleanup");
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!auth) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const expected = `Bearer ${secret}`;
  const actual = auth;

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = await createServiceRoleClient();
    const nowIso = new Date().toISOString();

    const { data: expired, error: selectError } = await admin
      .from("pending_bookings")
      .select("id")
      .eq("status", "pending")
      .eq("payment_method", "bank_transfer")
      .lt("expires_at", nowIso);

    if (selectError) {
      return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
    }

    const ids = (expired || []).map((b) => b.id);

    if (ids.length === 0) {
      logInfo(log, "No expired bank transfers found");
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    logInfo(log, `Found ${ids.length} expired bank transfers`, { ids });

    const { error: deleteError } = await admin
      .from("pending_bookings")
      .delete()
      .in("id", ids);

    if (deleteError) {
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    logInfo(log, `Deleted ${ids.length} expired bank transfers`);
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    logError(log, "Bank transfer cleanup cron failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_failed" },
      { status: 500 }
    );
  }
}
