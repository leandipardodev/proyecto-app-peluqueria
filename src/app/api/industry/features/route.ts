import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { DEFAULT_FEATURES, INDUSTRIES } from "@/lib/industry/types";
import type { Industry } from "@/lib/industry/types";
import { getFeatures } from "@/lib/industry/features";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const industry = searchParams.get("industry");

  if (!industry || !(INDUSTRIES as readonly string[]).includes(industry)) {
    return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
  }

  const features = await getFeatures(industry as Industry);
  return NextResponse.json({ features });
}
