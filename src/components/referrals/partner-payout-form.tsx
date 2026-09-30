"use client";

import { useActionState, useState } from "react";
import { Check, Wallet } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import { saveOwnPayoutAction, type OwnPayoutState } from "@/app/vendedores/actions";

type Props = {
  payoutAlias: string | null;
  payoutCbu: string | null;
  /** Boton que abre el modal. */
  trigger: React.ReactNode;
};

/**
 * Datos de cobro del vendedor, en un modal.
 *
 * El panel decia "Cargalo con Klip" y "Los carga Klip": cada pago era un
 * telefono. Ahora los carga el vendedor, con la misma validacion que el admin
 * (CBU de 22 digitos). El partnerId lo resuelve la sesion firmada, no el
 * formulario.
 */
export default function PartnerPayoutForm({ payoutAlias, payoutCbu, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<OwnPayoutState, FormData>(saveOwnPayoutAction, null);
  const [alias, setAlias] = useState(payoutAlias ?? "");
  const [cbu, setCbu] = useState(payoutCbu ?? "");

  const cbuDigits = cbu.replace(/\D/g, "");
  const cbuInvalid = cbuDigits.length > 0 && cbuDigits.length !== 22;
  const nothingToSave = alias.trim() === (payoutAlias ?? "").trim() && cbuDigits === (payoutCbu ?? "");

  return (
    <>
      {trigger}

      <BaseModal
        open={open}
        onClose={() => setOpen(false)}
        title="Datos de cobro"
        icon={<Wallet className="h-5 w-5" />}
        subtitle="Klip te transfiere una vez por local y por mes"
      >
        <form action={formAction} className="grid gap-4 px-6 py-6">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">
            Alias
            <input
              name="payoutAlias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="ana.gonzalez"
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-gray-900 dark:border-zinc-700 dark:text-zinc-100"
            />
          </label>

          <label className="text-xs text-zinc-500 dark:text-zinc-400">
            CBU
            <input
              name="payoutCbu"
              value={cbu}
              onChange={(event) => setCbu(event.target.value)}
              inputMode="numeric"
              placeholder="22 dígitos"
              className={`mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5 font-mono text-sm text-gray-900 dark:text-zinc-100 ${
                cbuInvalid ? "border-rose-400 bg-rose-50/60" : "border-zinc-300 dark:border-zinc-700"
              }`}
            />
          </label>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {cbuDigits.length > 0 && cbuDigits.length < 22
              ? `Faltan ${22 - cbuDigits.length} dígitos.`
              : cbuDigits.length > 22
                ? "El CBU tiene que tener 22 dígitos."
                : cbuDigits.length === 22
                  ? "Listo. Klip ve estos datos antes de transferirte."
                  : " Cargá el alias o el CBU para que Klip te pueda transferir."}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || cbuInvalid || nothingToSave}
              className="ui-btn-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
            {state?.saved ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                Guardados
              </span>
            ) : null}
            {state?.error ? <span className="text-xs font-medium text-rose-600">{state.error}</span> : null}
          </div>
        </form>
      </BaseModal>
    </>
  );
}
