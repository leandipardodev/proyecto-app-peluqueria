import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, getShopId } from "@/lib/dashboard/auth-server";
import { getArgentinaNow } from "@/lib/argentina-time";
import { APPOINTMENT_STATUS_NEEDS_CONFIRMATION } from "@/lib/dashboard/appointment-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const authUser = (await supabase.auth.getUser()).data?.user;
    if (!authUser) {
      return NextResponse.json({ urgentAppointments: false, lowStock: false }, { status: 200 });
    }

    const shopId = await getShopId({ user: { id: authUser.id } });
    if (!shopId) {
      return NextResponse.json({ urgentAppointments: false, lowStock: false }, { status: 200 });
    }

    const admin = await createServiceRoleClient();
    const nowAr = getArgentinaNow();
    const oneHourFromNow = new Date(nowAr.getTime() + 60 * 60 * 1000).toISOString();

    const [urgentRes, stockRes] = await Promise.all([
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .in("status", APPOINTMENT_STATUS_NEEDS_CONFIRMATION as unknown as string[])
        .gte("start_time", nowAr.toISOString())
        .lte("start_time", oneHourFromNow),
      admin.from("stock").select("id", { count: "exact", head: true }).eq("shop_id", shopId).lt("quantity", 5),
    ]);

    return NextResponse.json(
      {
        urgentAppointments: (urgentRes.count || 0) > 0,
        lowStock: (stockRes.count || 0) > 0,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ urgentAppointments: false, lowStock: false }, { status: 200 });
  }
}
