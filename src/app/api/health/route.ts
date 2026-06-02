import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import pkg from "@/../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  let supabaseStatus: "ok" | "error" = "ok";
  let supabaseLatency: number | null = null;

  try {
    const dbStart = Date.now();
    const supabase = await createServiceRoleClient();
    const { error } = await supabase.from("appointments").select("id").limit(1).maybeSingle();
    supabaseLatency = Date.now() - dbStart;
    if (error) supabaseStatus = "error";
  } catch {
    supabaseStatus = "error";
  }

  const body = {
    status: "ok",
    version: pkg.version,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    node: process.version,
    environment: process.env.NODE_ENV ?? "development",
    checks: {
      supabase: {
        status: supabaseStatus,
        latencyMs: supabaseLatency,
      },
    },
    responseTimeMs: Date.now() - start,
  };

  const statusCode = supabaseStatus === "ok" ? 200 : 503;

  return NextResponse.json(body, { status: statusCode });
}
