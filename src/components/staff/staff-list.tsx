"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addStaffMember,
  updateStaffName,
  updateStaffRole,
  removeStaff,
} from "@/lib/dashboard/staff-actions";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  revenue: number;
};

export default function StaffList({
  shopId,
  initialStaff,
  currentUserId,
  canManageStaff,
}: {
  shopId: string;
  initialStaff: StaffMember[];
  currentUserId: string;
  canManageStaff: boolean;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel(`staff-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_memberships", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_profiles", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("role", role);

    const result = await addStaffMember(formData, shopId);

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.data?.password) {
      setGeneratedPassword(result.data.password);
    }
    setLoginUrl(result.data?.login_url || null);

    setName("");
    setEmail("");
    setRole("staff");
    router.refresh();
  }

  async function handleRoleChange(id: string, newRole: "staff" | "owner") {
    const result = await updateStaffRole(id, newRole, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setStaff((prev) => prev.map((member) => (member.id === id ? { ...member, role: newRole } : member)));
  }

  async function handleRemove(id: string) {
    setDeleteTargetId(id);
  }

  async function confirmRemove() {
    const id = deleteTargetId;
    if (!id) return;
    const result = await removeStaff(id, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setStaff((prev) => prev.filter((member) => member.id !== id));
    setDeleteTargetId(null);
  }

  async function submitRename() {
    if (!canManageStaff || !renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;

    const result = await updateStaffName(renameTarget.id, trimmed, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setStaff((prev) => prev.map((member) => (member.id === renameTarget.id ? { ...member, name: trimmed } : member)));
    setRenameTarget(null);
    setRenameValue("");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">Personal</h2>
        {canManageStaff ? (
          <Button type="button" onClick={() => setShowForm(true)}>Agregar Peluquero</Button>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">Solo owner puede invitar y editar personal</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {showForm && canManageStaff && (
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-4 sm:p-6 mb-6">
          <h3 className="text-lg font-medium dark:text-gray-100 mb-4 tracking-tight">Nuevo Peluquero</h3>
          <div className="mb-4 rounded-xl border border-sky-200/60 bg-sky-50/80 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">
            1) Cargá nombre, email y rol. 2) Guardá. 3) Copiá el link de ingreso y compartilo con el peluquero.
            <br />
            El peluquero debe abrir ese link e iniciar sesión con ese mismo email para quedar asociado al local.
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="role">Rol</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "staff" | "owner")}
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 py-2 px-3 text-sm dark:text-gray-100 cursor-pointer"
              >
                <option value="staff">Peluquero</option>
                <option value="owner">Administrador</option>
              </select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                    setShowForm(false);
                    setGeneratedPassword(null);
                    setLoginUrl(null);
                  }}
              >
                Cancelar
              </Button>
            </div>
          </form>

          {(generatedPassword || loginUrl) && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
              {generatedPassword && (
                <>
                  <p className="text-sm text-green-800 dark:text-green-300 font-medium mb-2">
                    Usuario creado correctamente. Contraseña generada:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white dark:bg-gray-950 px-3 py-1.5 rounded border border-green-300 dark:border-green-700 text-sm font-mono dark:text-gray-100">
                      {generatedPassword}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPassword);
                        addToast("Contraseña copiada al portapapeles", "success");
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    Comparte esta contraseña con el peluquero.
                  </p>
                </>
              )}
              {loginUrl && (
                <div className="mt-3">
                  <p className="text-sm text-green-800 dark:text-green-300 font-medium mb-1">Link de ingreso:</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white dark:bg-gray-950 px-3 py-1.5 rounded border border-green-300 dark:border-green-700 text-xs font-mono dark:text-gray-100 truncate">
                      {loginUrl}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(loginUrl);
                        addToast("Link copiado al portapapeles", "success");
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="md:hidden space-y-3">
        {staff.length === 0 ? (
          <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[1.75rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-4 text-sm text-center text-gray-500 dark:text-gray-400">
            No hay personal registrado
          </div>
        ) : (
          staff.map((member) => {
            const isCurrentOwnerSelf = member.id === currentUserId && member.role === "owner";
            const selfOwnerTooltip = "No podés editar tu propio rol de administrador";
            return (
              <div key={member.id} className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[1.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{member.name || "-"}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email || "-"}</p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Rol</span>
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as "staff" | "owner")}
                       disabled={!canManageStaff || isCurrentOwnerSelf}
                    title={isCurrentOwnerSelf ? selfOwnerTooltip : undefined}
                    className="text-sm rounded border border-gray-300 dark:border-gray-600 py-1 px-2 bg-white dark:bg-gray-950 dark:text-gray-100 cursor-pointer"
                  >
                    <option value="staff">Peluquero</option>
                    <option value="owner">Admin</option>
                  </select>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Facturación</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">${member.revenue.toFixed(2)}</span>
                </div>
                <div className="mt-3 flex justify-end">
                     {!canManageStaff || isCurrentOwnerSelf ? (
                    <span className="text-xs text-gray-400 cursor-not-allowed select-none" title={selfOwnerTooltip}>-</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameTarget({ id: member.id, name: member.name || "" });
                          setRenameValue(member.name || "");
                        }}
                        className="text-sm text-violet-600 hover:text-violet-800 cursor-pointer select-none mr-3"
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(member.id)}
                        className="text-sm text-red-600 hover:text-red-800 cursor-pointer select-none"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-white/40 dark:bg-black/20">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Facturación
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-transparent dark:bg-transparent divide-y divide-white/20 dark:divide-white/10">
            {staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No hay personal registrado
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                (() => {
                  const isCurrentOwnerSelf = member.id === currentUserId && member.role === "owner";
                  const selfOwnerTooltip = "No podés editar tu propio rol de administrador";
                  return (
                <tr key={member.id} className="hover:bg-white/40 dark:hover:bg-white/5 cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {member.name || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {member.email || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as "staff" | "owner")}
                       disabled={!canManageStaff || isCurrentOwnerSelf}
                      title={isCurrentOwnerSelf ? selfOwnerTooltip : undefined}
                      className="text-sm rounded border border-gray-300 dark:border-gray-600 py-1 px-2 bg-white dark:bg-gray-950 dark:text-gray-100 cursor-pointer"
                    >
                      <option value="staff">Peluquero</option>
                      <option value="owner">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    ${member.revenue.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {!canManageStaff || isCurrentOwnerSelf ? (
                      <span className="text-gray-400 cursor-not-allowed select-none" title={selfOwnerTooltip}>
                        -
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameTarget({ id: member.id, name: member.name || "" });
                            setRenameValue(member.name || "");
                          }}
                          className="text-violet-600 hover:text-violet-800 cursor-pointer select-none mr-3"
                        >
                          Renombrar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(member.id)}
                          className="text-red-600 hover:text-red-800 cursor-pointer select-none"
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                  );
                })()
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2rem] border border-white/10 dark:border-white/5 p-5 shadow-2xl shadow-black/[0.08]">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Renombrar peluquero</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Actualizá el nombre visible en staff, turnos y calendario.</p>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-3 w-full rounded-xl border border-white/20 dark:border-white/10 bg-white/60 dark:bg-black/30 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              placeholder="Nombre"
              autoFocus
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenameTarget(null);
                  setRenameValue("");
                }}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitRename}
                className="px-3 py-1.5 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Eliminar personal"
        message="Se desvinculara este miembro del local y sus turnos futuros quedaran sin staff asignado."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
