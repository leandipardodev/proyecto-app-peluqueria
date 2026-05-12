"use client";

import { useActionState, useState, useEffect } from "react";
import { updateClientProfile } from "@/lib/dashboard/client-actions";
import { createClient } from "@/lib/supabase/client";
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
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mi Perfil</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Gestioná tu información personal
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-2xl">
        {state?.success && (
          <div className="mb-4 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm px-4 py-3 rounded-lg">
            Perfil actualizado correctamente
          </div>
        )}

        {state && !state.success && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg">
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
              required
              className="mt-1"
              placeholder="Ej: 11 1234-5678"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Lo usaremos para enviarte recordatorios
            </p>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              className="mt-1 bg-gray-50 dark:bg-gray-800 dark:text-gray-300"
              disabled
              value={userEmail}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
