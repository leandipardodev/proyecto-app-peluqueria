import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/dashboard/auth/server";
import { updateBusinessInfo } from "@/lib/dashboard/shop/business-actions";

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const formData = await request.formData();
  const result = await updateBusinessInfo(formData);
  return NextResponse.json(result);
}
