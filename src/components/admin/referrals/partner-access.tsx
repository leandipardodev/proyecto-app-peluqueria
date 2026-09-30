"use client";

import { useActionState, useEffect } from "react";
import {
  regeneratePartnerPinAction,
  savePartnerPayoutAction,
  type PartnerPinState,
  type PartnerPayoutState,
} from "@/app/admin/referrals/actions";
import { formatPin } from "@/lib/referrals/partner-message";

export function PinReveal({ pin, partnerName }: { pin: string; partnerName: string }) {
  return (
    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">PIN de {partnerName}</p>
      <p className="mt-2 font-mono text-2xl font-bold tracking-[0.35em] text-amber-900">{formatPin(pin)}</p>
      <p className="mt-2 text-xs text-amber-800">
        Anotalo y pasaselo. No se vuelve a mostrar: si se pierde, regeneralo. Los locales y las comisiones que ya
        tiene no se tocan.
      </p>
    </div>
  );
}

export function PinButton({
  partnerId,
  partnerName,
  hasPin,
  onGenerated,
  compact = false,
}: {
  partnerId: string;
  partnerName: string;
  hasPin: boolean;
  /** Sube el PIN recien generado para que un modal pueda mostrarlo. */
  onGenerated?: (pin: string) => void;
  compact?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<PartnerPinState, FormData>(
    regeneratePartnerPinAction,
    null,
  );

  useEffect(() => {
    if (state?.pin) onGenerated?.(state.pin);
  }, [state?.pin, onGenerated]);

  return (
    <div className={compact ? "" : "space-y-2"}>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="partnerId" value={partnerId} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {isPending ? "Generando…" : hasPin ? "Regenerar PIN" : "Generar PIN"}
        </button>
      </form>

      {state?.error ? <p className="mt-1 text-xs text-rose-600">{state.error}</p> : null}
      {!compact && state?.pin ? <PinReveal pin={state.pin} partnerName={partnerName} /> : null}
    </div>
  );
}

export function PayoutFields({
  partnerId,
  partnerName,
  defaultAlias,
  defaultCbu,
}: {
  partnerId: string;
  partnerName: string;
  defaultAlias: string | null;
  defaultCbu: string | null;
}) {
  const [state, formAction, isPending] = useActionState<PartnerPayoutState, FormData>(
    savePartnerPayoutAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="partnerId" value={partnerId} />
      <p className="text-xs text-zinc-500">Cobro de {partnerName}</p>
      <input
        name="payoutAlias"
        defaultValue={defaultAlias || ""}
        placeholder="Alias (ej. klip.juanperez)"
        className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:text-zinc-100"
      />
      <input
        name="payoutCbu"
        defaultValue={defaultCbu || ""}
        inputMode="numeric"
        placeholder="CBU (22 dígitos)"
        className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm text-gray-900 dark:border-zinc-700 dark:text-zinc-100"
      />
      <button
        type="submit"
        disabled={isPending}
        className="ui-btn-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {isPending ? "Guardando…" : "Guardar cobro"}
      </button>
      {state?.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
      {state?.saved ? <p className="text-xs text-emerald-700">Datos de cobro guardados.</p> : null}
    </form>
  );
}
