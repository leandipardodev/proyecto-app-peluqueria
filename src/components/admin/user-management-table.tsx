"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Ban, Trash2, ShieldCheck, UserX, Search } from "lucide-react";

type UserItem = {
  userId: string;
  email: string | null;
  name: string | null;
  nombre: string | null;
  role: string | null;
  platformRole: string;
  isActive: boolean;
  isBanned: boolean;
  bannedAt: string | null;
  shopName: string | null;
  shopSlug: string | null;
  createdAt: string | null;
};

type Props = {
  users: UserItem[];
  total: number;
  page: number;
  perPage: number;
  q: string;
  filter: string;
  onBan: (userId: string, banned: boolean) => Promise<{ success: boolean; error?: string }>;
  onDelete: (userId: string) => Promise<{ success: boolean; error?: string }>;
  currentUserId: string;
};

export default function UserManagementTable({
  users,
  total,
  page,
  perPage,
  q,
  filter,
  onBan,
  onDelete,
  currentUserId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [confirmBan, setConfirmBan] = useState<{ userId: string; banned: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function buildUrl(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    return `?${params.toString()}`;
  }

  async function handleBan() {
    if (!confirmBan) return;
    const result = await onBan(confirmBan.userId, confirmBan.banned);
    setConfirmBan(null);
    if (result.success) {
      startTransition(() => router.refresh());
    } else if (result.error) {
      alert(result.error);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const result = await onDelete(confirmDelete);
    setConfirmDelete(null);
    if (result.success) {
      startTransition(() => router.refresh());
    } else if (result.error) {
      alert(result.error);
    }
  }

  return (
    <>
      <form className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="text-xs text-zinc-500">Buscar</label>
          <div className="mt-1 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="email, nombre..."
              className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500">Filtrar</label>
          <select name="filter" defaultValue={filter} className="mt-1 min-w-[180px] rounded-xl border border-zinc-300 px-3 py-2 text-sm">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="banned">Banneados</option>
          </select>
        </div>
        <button type="submit" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
          Buscar
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Tienda</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Registro</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  No se encontraron usuarios.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.userId} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{user.name || user.nombre || "Sin nombre"}</p>
                    <p className="text-xs text-zinc-500">{user.email || "sin email"}</p>
                  </td>
                  <td className="px-3 py-2">
                    {user.shopName ? (
                      <div>
                        <p className="text-sm">{user.shopName}</p>
                        <p className="text-xs text-zinc-500">/{user.shopSlug}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.platformRole === "super_admin"
                        ? "bg-purple-100 text-purple-700"
                        : user.role === "owner"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-zinc-100 text-zinc-600"
                    }`}>
                      {user.platformRole === "super_admin" && <ShieldCheck className="h-3 w-3" />}
                      {user.platformRole === "super_admin" ? "Super Admin" : user.role || "user"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {user.isBanned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <UserX className="h-3 w-3" />
                        Banneado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Activo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString("es-AR") : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {user.userId === currentUserId ? (
                      <span className="text-xs text-zinc-400">Vos</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirmBan({ userId: user.userId, banned: !user.isBanned })}
                          className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                            user.isBanned
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          }`}
                          title={user.isBanned ? "Desbanear" : "Banear"}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(user.userId)}
                          className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                          title="Borrar usuario"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{total} usuario{total !== 1 ? "s" : ""} total · Pagina {page} de {totalPages}</span>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <a
              href={buildUrl({ page: String(page - 1) })}
              className="rounded-full border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
            >
              Anterior
            </a>
          ) : null}
          {page < totalPages ? (
            <a
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-full border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
            >
              Siguiente
            </a>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmBan}
        title={confirmBan?.banned ? "Banear usuario" : "Desbanear usuario"}
        message={
          confirmBan?.banned
            ? "Este usuario no podra acceder a la plataforma. Se invalidaran sus sesiones activas."
            : "El usuario podra volver a acceder a la plataforma."
        }
        confirmLabel={confirmBan?.banned ? "Banear" : "Desbanear"}
        danger={confirmBan?.banned}
        onConfirm={handleBan}
        onCancel={() => setConfirmBan(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Borrar usuario"
        message="Esta accion es permanente. Se eliminaran todos los datos del usuario incluyendo membresias y perfil. La cuenta de autenticacion tambien sera eliminada."
        confirmLabel="Borrar usuario"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
