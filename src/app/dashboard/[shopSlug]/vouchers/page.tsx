import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopVouchersPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  redirect(`/dashboard/${shopSlug}/fidelizacion`);
}
