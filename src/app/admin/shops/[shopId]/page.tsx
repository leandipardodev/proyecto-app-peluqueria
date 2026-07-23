import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { fetchShopDetail } from "@/lib/admin/shop-detail";
import ShopDetailClient from "./shop-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminShopDetailPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  await requireSuperAdmin();
  const { shopId } = await params;

  const shop = await fetchShopDetail(shopId);
  if (!shop) notFound();

  return (
    <div className="space-y-6">
      <section>
        <Link
          href="/admin/shops"
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          &larr; Volver a tiendas
        </Link>
      </section>

      <ShopDetailClient shop={shop} />
    </div>
  );
}
