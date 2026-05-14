import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceRoleClient();
  const today = new Date();
  const todayMMDD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { data, error } = await admin
    .from("vouchers")
    .select("id, gifted_to_birthday, status")
    .in("status", ["pending", "sent"]);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const dueIds = (data || [])
    .filter((v) => {
      const d = new Date(`${v.gifted_to_birthday}T00:00:00`);
      const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return mmdd === todayMMDD;
    })
    .map((v) => v.id);

  if (dueIds.length > 0) {
    const { error: updateError } = await admin
      .from("vouchers")
      .update({ status: "due_today", updated_at: new Date().toISOString() })
      .in("id", dueIds);
    if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: dueIds.length });
}
