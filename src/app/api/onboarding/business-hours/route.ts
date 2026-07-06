import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/dashboard/auth/server";
import { updateBusinessHours } from "@/lib/dashboard/shop/business-actions";
import type { BusinessHoursData } from "@/lib/dashboard/shop/business-actions";

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const body = (await request.json()) as BusinessHoursData;
  const result = await updateBusinessHours(body);
  return NextResponse.json(result);
}
