import crypto from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { createLogContext, logInfo, logError } from "@/lib/api-logger";

const READ_TTL_DAYS = 30;
const UNREAD_TTL_DAYS = 90;

export async function GET(request: Request) {
  const log = createLogContext("GET", "/api/cron/notifications-cleanup");
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || !auth) {
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
    const now = Date.now();
    const cutoffReadIso = new Date(now - READ_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const cutoffUnreadIso = new Date(now - UNREAD_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let deletedRead = 0;
    const { data: oldReads, error: readsError } = await admin
      .from("notification_reads")
      .select("notification_id")
      .lt("read_at", cutoffReadIso);

    if (readsError) {
      return NextResponse.json({ ok: false, error: readsError.message }, { status: 500 });
    }

    const oldReadIds = Array.from(new Set((oldReads || []).map((r) => r.notification_id)));
    if (oldReadIds.length > 0) {
      const { error: deleteError } = await admin.from("notifications").delete().in("id", oldReadIds);
      if (deleteError) {
        return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
      }
      deletedRead = oldReadIds.length;
    }

    let deletedUnread = 0;
    const { data: oldNotifs, error: notifsError } = await admin
      .from("notifications")
      .select("id")
      .lt("created_at", cutoffUnreadIso);

    if (notifsError) {
      return NextResponse.json({ ok: false, error: notifsError.message }, { status: 500 });
    }

    if (oldNotifs && oldNotifs.length > 0) {
      const { data: allReads } = await admin.from("notification_reads").select("notification_id");
      const readSet = new Set((allReads || []).map((r) => r.notification_id));
      const toDelete = oldNotifs.map((n) => n.id).filter((id) => !readSet.has(id));
      if (toDelete.length > 0) {
        const { error: deleteError } = await admin.from("notifications").delete().in("id", toDelete);
        if (deleteError) {
          return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
        }
        deletedUnread = toDelete.length;
      }
    }

    logInfo(log, "Notification cleanup finished", { deletedRead, deletedUnread });
    return NextResponse.json({ ok: true, deletedRead, deletedUnread });
  } catch (error) {
    logError(log, "Notification cleanup cron failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_failed" },
      { status: 500 }
    );
  }
}
