"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addStaffMember,
  updateStaffRole,
  removeStaff,
} from "@/lib/dashboard/staff-actions";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  revenue: number;
};

export default function StaffList({
  initialStaff,
}: {
  initialStaff: StaffMember[];
}) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("role", role);

    const result = await addStaffMember(formData);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.password) {
      setGeneratedPassword(result.password);
    }

    setName("");
    setEmail("");
    setRole("staff");
  }

  async function handleRoleChange(id: string, newRole: "staff" | "owner") {
    const result = await updateStaffRole(id, newRole);
    if (result.error) {
      alert(result.error as string);
      return;
    }
    window.location.reload();
  }

  async function handleRemove(id: string) {
    if (!confirm("¿Estás seguro de eliminar este miembro?")) return;
    const result = await removeStaff(id);
    if (result.error) {
      alert(result.error as string);
      return;
    }
    window.location.reload();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Personal</h2>
        <Button onClick={() => setShowForm(true)}>Agregar Peluquero</Button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h3 className="text-lg font-medium dark:text-gray-100 mb-4">Nuevo Peluquero</h3>
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
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 py-2 px-3 text-sm dark:text-gray-100"
              >
                <option value="staff">Peluquero</option>
                <option value="owner">Administrador</option>
              </select>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setGeneratedPassword(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>

          {generatedPassword && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
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
                    alert("Contraseña copiada al portapapeles");
                  }}
                >
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Comparte esta contraseña con el peluquero. Se le solicitará cambiarla en el primer inicio de sesión.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
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
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No hay personal registrado
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {member.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {member.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as "staff" | "owner")}
                      className="text-sm rounded border border-gray-300 dark:border-gray-600 py-1 px-2 bg-white dark:bg-gray-950 dark:text-gray-100"
                    >
                      <option value="staff">Peluquero</option>
                      <option value="owner">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    ${member.revenue.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
