"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { markTransfersPaidAction, type MarkPaidState } from "@/app/admin/referrals/actions";
import type { PendingTransferItem } from "@/lib/admin/referrals";

type Props = {
 transfers: PendingTransferItem[];
 /** Callbacks para filtrar sin round-trip: la pagina guarda el filtro en la URL. */
 onFilterPartner?: (partnerId: string) => void;
 activePartnerFilter?: string;
 partnerOptions: { id: string; name: string }[];
};

function money(value: number) {
 return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function monthLabel(ym: string) {
 const [year, month] = ym.split("-").map(Number);
 if (!year || !month) return ym;
 const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
 return `${names[month - 1]} ${year}`;
}

/**
 * "Te debo": una fila por local y por mes, que es como se transfiere de verdad.
 *
 * Se marca por fila, no por vendedor: el boton viejo pagaba TODO lo pendiente
 * de un vendedor de una, sin confirmacion, y contradecía el texto de la tabla.
 */
export default function TransferList({
 transfers,
 onFilterPartner,
 activePartnerFilter = "all",
 partnerOptions,
}: Props) {
 const [state, formAction, pending] = useActionState<MarkPaidState, FormData>(markTransfersPaidAction, null);
 const [selected, setSelected] = useState<Record<string, boolean>>({});
 const [filter, setFilter] = useState(activePartnerFilter);

 const visible = filter === "all" ? transfers : transfers.filter((t) => t.partnerId === filter);
 const chosen = visible.filter((t) => selected[t.ledgerId]);
 const chosenTotal = chosen.reduce((acc, t) => acc + Number(t.commissionAmount || 0), 0);

 function toggle(id: string) {
 setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
 }

 function applyFilter(value: string) {
 setFilter(value);
 onFilterPartner?.(value);
 }

 if (transfers.length === 0) {
 return (
 <p className="py-3 text-sm font-light text-zinc-400">
 No hay comisiones pendientes. Cuando un local registrado por un vendedor haga su primer pago, va a
 aparecer acá como una fila para transferir.
 </p>
 );
 }

 return (
 <div className="space-y-4">
 <div className="flex flex-wrap items-center gap-3">
 <select
 value={filter}
 onChange={(event) => applyFilter(event.target.value)}
 aria-label="Filtrar por vendedor"
 className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm"
 >
 <option value="all">Todos los vendedores</option>
 {partnerOptions.map((partner) => (
 <option key={partner.id} value={partner.id}>
 {partner.name}
 </option>
 ))}
 </select>

 <span className="text-sm text-zinc-500 dark:text-zinc-400">
 {chosen.length > 0
 ? `${chosen.length} ${chosen.length === 1 ? "seleccionada" : "seleccionadas"} · ${money(chosenTotal)}`
 : `${visible.length} ${visible.length === 1 ? "transferencia" : "transferencias"}`}
 </span>
 </div>

 <ul className="divide-y divide-zinc-100">
 {visible.map((transfer) => {
 const isSelected = Boolean(selected[transfer.ledgerId]);
 return (
 <li key={transfer.ledgerId}>
 <label className="flex cursor-pointer items-center gap-4 py-3.5 transition hover:bg-zinc-50/60">
 <input
 type="checkbox"
 name="ledgerId"
 value={transfer.ledgerId}
 checked={isSelected}
 onChange={() => toggle(transfer.ledgerId)}
 className="h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-700 accent-amber-500"
 />
 <span className="min-w-0 flex-1">
 <span className="flex flex-wrap items-baseline gap-x-2">
 <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
 {transfer.shopName}
 </span>
 <span className="truncate text-xs text-zinc-400">
 {transfer.partnerName}
 </span>
 </span>
 <span className="mt-0.5 block text-xs text-zinc-400">
 {monthLabel(transfer.periodYm)} · pago {transfer.paymentSequence} ·{" "}
 {transfer.payoutAlias || transfer.payoutCbu || "sin datos de cobro"}
 </span>
 </span>
 <span className="shrink-0 text-right">
 <span className="block text-sm font-semibold text-amber-600 tabular-nums">
 {money(transfer.commissionAmount)}
 </span>
 <span className="block text-xs tabular-nums text-zinc-400">
 neto {money(transfer.netAmount)}
 </span>
 </span>
 </label>
 </li>
 );
 })}
 </ul>

 <form action={formAction} className="flex items-center gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
 <button
 type="submit"
 disabled={pending || chosen.length === 0}
 className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:opacity-40"
 >
 <Check className="h-4 w-4" />
 {pending
 ? "Marcando…"
 : `Marcar ${chosen.length || ""} ${chosen.length === 1 ? "paga" : "pagadas"}`}
 </button>
 {state?.paid ? (
 <span className="text-sm text-emerald-600">
 {state.count} {state.count === 1 ? "transferencia" : "transferencias"} · {money(state.amount)}
 </span>
 ) : null}
 {state?.error ? <span className="text-sm text-rose-600">{state.error}</span> : null}
 </form>
 </div>
 );
}
