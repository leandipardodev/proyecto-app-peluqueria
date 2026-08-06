import { redirect } from "next/navigation";

interface StorePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; order?: string }>;
}

export const dynamic = "force-dynamic";

export default async function PublicStorePage({ params, searchParams }: StorePageProps) {
  const [slug, sp] = await Promise.all([(await params).slug, searchParams]);
  const query = new URLSearchParams();
  if (sp.status) query.set("status", sp.status);
  if (sp.order) query.set("order", sp.order);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/book/${encodeURIComponent(slug)}${suffix}`);
}
