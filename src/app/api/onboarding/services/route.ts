import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/dashboard/auth/server";
import { createService } from "@/lib/dashboard/services/service-actions";

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const formData = await request.formData();
  const result = await createService(formData);
  return NextResponse.json(result);
}
