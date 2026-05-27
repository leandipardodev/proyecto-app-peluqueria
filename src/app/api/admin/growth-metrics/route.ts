import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchGrowthMetrics } from "@/lib/analytics/growth-metrics";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("platform_role, role")
      .eq("user_id", user.id)
      .maybeSingle();

    const platformRole =
      (profile as { platform_role?: string | null; role?: string | null } | null)?.platform_role ||
      (((profile as { role?: string | null } | null)?.role === "superadmin") ? "super_admin" : "user");

    if (platformRole !== "super_admin") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const rawDays = request.nextUrl.searchParams.get("lookbackDays");
    const parsedDays = rawDays ? Number(rawDays) : 90;
    const lookbackDays = Number.isFinite(parsedDays)
      ? Math.min(365, Math.max(7, Math.floor(parsedDays)))
      : 90;

    const metrics = await fetchGrowthMetrics(lookbackDays);
    return NextResponse.json({ ok: true, data: metrics });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "internal_error" },
      { status: 500 }
    );
  }
}
