import Link from "next/link";
import { Suspense } from "react";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { fetchShopsAdmin, deleteShop, toggleShopActive } from "@/lib/admin/user-management";
import ShopManagementTable from "@/components/admin/shop-management-table";

export const dynamic = "force-dynamic";

export default async function AdminShopsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const result = await fetchShopsAdmin({ q, filter, page });

  async function handleDelete(shopId: string) {
    "use server";
    return deleteShop(shopId);
  }

  async function handleToggleActive(shopId: string) {
    "use server";
    return toggleShopActive(shopId);
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-800">
            &larr; Volver a admin
          </Link>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Tiendas</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Gestionar tiendas, activar/desactivar y eliminaciones.
          </p>
        </div>
      </section>

      <Suspense fallback={<div className="text-sm text-zinc-500">Cargando...</div>}>
        <ShopManagementTable
          shops={result.shops}
          total={result.total}
          page={result.page}
          perPage={result.perPage}
          q={q}
          filter={filter}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
        />
      </Suspense>
    </div>
  );
}
