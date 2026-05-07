"use client";

import { useActionState } from "react";
import { updateClientProfile } from "@/lib/dashboard/client-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ClientProfilePage() {
  const [state, action, pending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const result = await updateClientProfile(formData);
      return result;
    },
    null
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gestioná tu información personal
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        {state?.success && (
          <div className="mb-4 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">
            Perfil actualizado correctamente
          </div>
        )}

        {state?.error && (
          <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
            {state.error}
          </div>
        )}

        <form action={action} className="space-y-5">
          <div>
            <Label htmlFor="name">Nombre completo</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              className="mt-1"
              defaultValue=""
            />
          </div>

          <div>
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              className="mt-1"
              placeholder="Opcional"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              className="mt-1 bg-gray-50"
              disabled
              value="usuario@email.com"
            />
            <p className="mt-1 text-xs text-gray-500">
              El email no se puede cambiar
            </p>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </form>
      </div>
    </div>
  );
}
