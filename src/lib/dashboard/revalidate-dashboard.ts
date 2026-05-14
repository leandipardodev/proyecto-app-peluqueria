import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";

function normalizeSegment(segment: string): string {
  if (!segment || segment === "/") return "";
  return segment.startsWith("/") ? segment : `/${segment}`;
}

async function resolveShopSlug(shopId: string): Promise<string | null> {
  const admin = await createServiceRoleClient();
  const { data } = await admin.from("shops").select("slug").eq("id", shopId).maybeSingle();
  const slug = (data?.slug as string | undefined)?.trim();
  return slug || null;
}

export async function revalidateDashboardSegments(shopId: string | null | undefined, segments: string[]): Promise<void> {
  if (!shopId) return;
  const slug = await resolveShopSlug(shopId);
  if (!slug) return;
  const uniqueSegments = Array.from(new Set(segments.map(normalizeSegment)));

  for (const segment of uniqueSegments) {
    revalidatePath(`/dashboard/${slug}${segment}`);
  }
}
