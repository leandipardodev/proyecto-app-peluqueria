"use client";

import { useActionState, useState } from "react";
import { resolveNeedsReviewAction, type ResolveReviewState } from "@/app/admin/referrals/actions";
import type { PendingTransferItem } from "@/lib/admin/referrals";

type Props = {
  items: PendingTransferItem[];
};

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

/**
 * Pagos cuyo neto no se pudo determinar.
 *
 * El sync crea la fila con comision 0 y estado `needs_review` en vez de
 * inventar un monto. Antes no habia forma de cerrarlas desde la app: quedaban
 * terminales y para siempre consumiendo un mes de la ventana de comision. Ahora
 * se carga el neto verificado en el panel de Mercado Pago y la fila pasa a
 * pagable.
 */
export default function NeedsReviewList({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((item) => (
        <li key={item.ledgerId} className="py-4">
          <ResolveRow item={item} />
        </li>
      ))}
    </ul>
  );
}

function ResolveRow({ item }: { item: PendingTransferItem }) {
  const [state, formAction, pending] = useActionState<ResolveReviewState, FormData>(resolveNeedsReviewAction, null);
  const [net, setNet] = useState("");

  if (state?.saved) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <span className="font-medium">{item.shopName}</span>
        <span>cerrado con {money(state.commission ?? 0)} de comisión</span>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="ledgerId" value={item.ledgerId} />
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium text-zinc-900">{item.shopName}</span>
        <span className="text-xs text-zinc-400">
          {item.partnerName} · {item.periodYm} · pago {item.paymentSequence}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-500">
          Neto que entró a Klip
          <input
            name="netAmount"
            value={net}
            onChange={(event) => setNet(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="ml-2 w-32 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm tabular-nums"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !net.trim()}
          className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800  px-4 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Cerrar"}
        </button>
        {state?.error ? <span className="text-xs text-rose-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
