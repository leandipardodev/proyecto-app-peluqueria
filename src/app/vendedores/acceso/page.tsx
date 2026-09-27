"use client";

import { useActionState } from "react";
import { loginPartnerAction, type PartnerLoginState } from "@/app/vendedores/actions";
import { InputForm } from "@/components/ui/input-form";
import { SubmitBtn } from "@/components/ui/submit-btn";

export default function PartnerAccessPage() {
  const [state, formAction, isPending] = useActionState<PartnerLoginState, FormData>(
    loginPartnerAction,
    null,
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-violet-700 tracking-tight">Klip</h1>
          <p className="mt-2 text-gray-600">Acceso para vendedores</p>
        </div>

        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Ingresá con el código que te pasó Klip y el PIN de 6 dígitos.
          </p>

          {state?.error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{state.error}</div>
          )}

          <form action={formAction} className="space-y-5">
            <InputForm
              label="Código"
              name="code"
              required
              autoFocus
              placeholder="JUAN123"
              autoComplete="username"
            />
            <InputForm
              label="PIN"
              name="pin"
              type="password"
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              autoComplete="current-password"
            />
            <SubmitBtn isPending={isPending} pendingText="Verificando..." defaultText="Entrar" />
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">
          ¿Perdiste el PIN? Pedile a Klip que te lo regenere.
        </p>
      </div>
    </div>
  );
}
