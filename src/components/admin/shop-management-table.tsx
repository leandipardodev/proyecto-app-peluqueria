"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Trash2, Power, Search, AlertTriangle } from "lucide-react";

type ShopItem = {
  shopId: string;
  nombre: string;
  slug: string;
  industry: string;
  industryLabel: string;
  active: boolean;
  planExpiry: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  memberCount: number;
  createdAt: string | null;
};

type Props = {
  shops: ShopItem[];
  total: number;
  page: number;
  perPage: number;
  q: string;
  filter: string;
  onDelete: (shopId: string) => Promise<{ success: boolean; error?: string }>;
  onToggleActive: (shopId: string) => Promise<{ success: boolean; error?: string }>;
};

export default function ShopManagementTable({
  shops,
  total,
  page,
  perPage,
  q,
  filter,
  onDelete,
  onToggleActive,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<ShopItem | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<ShopItem | null>(null);
  const [deleteText, setDeleteText] = useState("");

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

  async function handleDelete() {
    if (!confirmDelete || deleteText.trim().toUpperCase() !== "CONFIRMAR") return;
    const result = await onDelete(confirmDelete.shopId);
    setConfirmDelete(null);
    setDeleteText("");
    if (result.success) {
      startTransition(() => router.refresh());
    } else if (result.error) {
      alert(result.error);
    }
  }

  async function handleToggle() {
    if (!confirmToggle) return;
    const result = await onToggleActive(confirmToggle.shopId);
    setConfirmToggle(null);
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
              placeholder="nombre, slug..."
              className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500">Filtrar</label>
          <select name="filter" defaultValue={filter} className="mt-1 min-w-[180px] rounded-xl border border-zinc-300 px-3 py-2 text-sm">
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>
        <button type="submit" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
          Buscar
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Local</th>
              <th className="px-3 py-2">Rubro</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Miembros</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Vencimiento</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  No se encontraron tiendas.
                </td>
              </tr>
            ) : (
              shops.map((shop) => {
                const planExpired = shop.planExpiry
                  ? new Date(shop.planExpiry) < new Date()
                  : false;
                return (
                  <tr key={shop.shopId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium">{shop.nombre}</p>
                      <p className="text-xs text-zinc-500">/{shop.slug}</p>
                    </td>
                    <td className="px-3 py-2">{shop.industryLabel}</td>
                    <td className="px-3 py-2">
                      <p className="text-sm">{shop.ownerName || "-"}</p>
                      <p className="text-xs text-zinc-500">{shop.ownerEmail || ""}</p>
                    </td>
                    <td className="px-3 py-2 text-center">{shop.memberCount}</td>
                    <td className="px-3 py-2">
                      {shop.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {shop.planExpiry ? (
                        <span className={planExpired ? "text-red-600 font-medium" : "text-zinc-500"}>
                          {new Date(shop.planExpiry).toLocaleDateString("es-AR")}
                          {planExpired && " (vencido)"}
                        </span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirmToggle(shop)}
                          className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                            shop.active
                              ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                          title={shop.active ? "Desactivar" : "Activar"}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDelete(shop);
                            setDeleteText("");
                          }}
                          className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                          title="Borrar tienda"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{total} tienda{total !== 1 ? "s" : ""} total · Pagina {page} de {totalPages}</span>
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
        open={!!confirmToggle}
        title={confirmToggle?.active ? "Desactivar tienda" : "Activar tienda"}
        message={
          confirmToggle?.active
            ? "La tienda no sera accesible para sus miembros mientras este desactivada."
            : "La tienda volvera a estar accesible para sus miembros."
        }
        confirmLabel={confirmToggle?.active ? "Desactivar" : "Activar"}
        danger={!!confirmToggle?.active}
        onConfirm={handleToggle}
        onCancel={() => setConfirmToggle(null)}
      />

      {/* Delete modal with type-to-confirm */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-xl p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="text-base font-semibold text-gray-900">Borrar tienda</h3>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Esta accion es <strong>permanente</strong>. Se eliminaran todos los datos de{" "}
              <strong>{confirmDelete.nombre}</strong> incluyendo turnos, clientes, servicios,
              finanzas y membresias. Escribi <strong>CONFIRMAR</strong> para continuar.
            </p>
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder='Escribi "CONFIRMAR"'
              className="mt-3 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              autoFocus
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="ui-btn-ghost rounded-lg px-3 py-1.5 text-sm"
                onClick={() => {
                  setConfirmDelete(null);
                  setDeleteText("");
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteText.trim().toUpperCase() !== "CONFIRMAR"}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Borrar tienda
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
