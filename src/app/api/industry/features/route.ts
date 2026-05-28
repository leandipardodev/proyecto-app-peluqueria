import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { DEFAULT_FEATURES, INDUSTRIES } from "@/lib/industry/types";
import type { Industry } from "@/lib/industry/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const industry = searchParams.get("industry");

  if (!industry || !(INDUSTRIES as readonly string[]).includes(industry)) {
    return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();
  const { data } = await supabase
    .from("industry_config")
    .select("features")
    .eq("industry", industry as Industry)
    .maybeSingle();

  if (data?.features) {
    const parsed = data.features as Record<string, boolean>;
    return NextResponse.json({
      features: {
        inventory: typeof parsed.inventory === "boolean" ? parsed.inventory : DEFAULT_FEATURES[industry as Industry].inventory,
      },
    });
  }

  return NextResponse.json({ features: DEFAULT_FEATURES[industry as Industry] });
}
