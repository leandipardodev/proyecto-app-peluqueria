import Link from "next/link";
import { Suspense } from "react";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { fetchUsersAdmin, banUser, deleteUser } from "@/lib/admin/user-management";
import UserManagementTable from "@/components/admin/user-management-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const result = await fetchUsersAdmin({ q, filter, page });

  async function handleBan(userId: string, banned: boolean) {
    "use server";
    return banUser(userId, banned);
  }

  async function handleDelete(userId: string) {
    "use server";
    return deleteUser(userId);
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-800">
            &larr; Volver a admin
          </Link>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Usuarios</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Gestionar cuentas de usuario, baneos y eliminaciones.
          </p>
        </div>
      </section>

      <Suspense fallback={<div className="text-sm text-zinc-500">Cargando...</div>}>
        <UserManagementTable
          users={result.users}
          total={result.total}
          page={result.page}
          perPage={result.perPage}
          q={q}
          filter={filter}
          onBan={handleBan}
          onDelete={handleDelete}
          currentUserId={session.userId}
        />
      </Suspense>
    </div>
  );
}
