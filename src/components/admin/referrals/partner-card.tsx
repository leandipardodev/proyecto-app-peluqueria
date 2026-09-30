"use client";

import { useState } from "react";
import { Pencil, Store } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import PartnerLinkModal from "@/components/admin/referrals/partner-link-modal";
import { PayoutFields } from "@/components/admin/referrals/partner-access";
import type { PartnerSummary, ReferredShopItem } from "@/lib/admin/referrals";

type Props = {
 partner: PartnerSummary;
 shops: ReferredShopItem[];
 baseUrl: string;
 /** Server action que guarda nombre, telefono, codigo, regla y activo. */
 editAction: (formData: FormData) => void | Promise<void>;
 phone: string | null;
};

function money(value: number) {
 return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

/**
 * Un vendedor, en una tarjeta. Todo lo editable vive en el modal: la tarjeta
 * solo muestra y actua como disparador.
 *
 * El codigo va siempre a la vista porque es publico —va dentro del link— y
 * consultar un dato publico no deberia obligar a regenerar nada.
 */
export default function PartnerCard({ partner, shops, baseUrl, editAction, phone }: Props) {
 const [editing, setEditing] = useState(false);

 return (
 <>
 <div className="flex flex-col rounded-3xl border border-zinc-200/80 bg-white p-5">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="truncate text-base font-semibold text-zinc-900">{partner.partnerName}</p>
 <p className="mt-0.5 font-mono text-sm text-zinc-500">{partner.referralCode}</p>
 </div>
 <button
 type="button"
 onClick={() => setEditing(true)}
 aria-label={`Editar ${partner.partnerName}`}
 className="shrink-0 rounded-full p-2 text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-600"
 >
 <Pencil className="h-4 w-4" />
 </button>
 </div>

 <div className="mt-4 flex items-end gap-4">
 <div>
 <p className="text-[11px] uppercase tracking-wider text-zinc-400">Te debe</p>
 <p className="text-xl font-semibold text-amber-600 tabular-nums">
 {money(partner.pendingCommission)}
 </p>
 </div>
 <div>
 <p className="text-[11px] uppercase tracking-wider text-zinc-400">Pagado</p>
 <p className="text-xl font-semibold text-emerald-600 tabular-nums">
 {money(partner.paidCommission)}
 </p>
 </div>
 <div>
 <p className="text-[11px] uppercase tracking-wider text-zinc-400">Locales</p>
 <p className="text-xl font-semibold text-zinc-900 tabular-nums">
 {partner.referredShops}
 </p>
 </div>
 </div>

 <div className="mt-4 flex flex-wrap items-center gap-2">
 <PartnerLinkModal
 partnerId={partner.partnerId}
 partnerName={partner.partnerName}
 referralCode={partner.referralCode}
 hasPin={partner.hasPin}
 pinLast4={partner.pinLast4}
 baseUrl={baseUrl}
 />
 <span className="text-xs text-zinc-400">
 {partner.rulePercent}% × {partner.ruleMonths} meses
 </span>
 {!partner.isActive ? (
 <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
 Inactivo
 </span>
 ) : null}
 </div>
 </div>

 <BaseModal
 open={editing}
 onClose={() => setEditing(false)}
 title={partner.partnerName}
 icon={<Pencil className="h-5 w-5" />}
 subtitle={partner.partnerEmail || "Sin email"}
 maxWidth="lg"
 >
 <div className="grid gap-8 px-6 py-6 sm:grid-cols-2">
 <form action={editAction} className="space-y-3">
 <input type="hidden" name="partnerId" value={partner.partnerId} />

 <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Datos</h3>
 <input
 name="name"
 defaultValue={partner.partnerName}
 placeholder="Nombre"
 className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 <input
 name="email"
 type="email"
 defaultValue={partner.partnerEmail || ""}
 placeholder="Email"
 className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 <input
 name="phone"
 defaultValue={phone || ""}
 placeholder="Teléfono"
 className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 <input
 name="referralCode"
 defaultValue={partner.referralCode}
 placeholder="Código"
 className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm"
 />

 <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Regla</h3>
 <div className="flex gap-2">
 <input
 name="commissionPercentOverride"
 type="number"
 min="0"
 max="100"
 step="0.1"
 defaultValue={partner.rulePercent}
 aria-label="Porcentaje"
 className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 <input
 name="commissionMonthsOverride"
 type="number"
 min="1"
 max="24"
 defaultValue={partner.ruleMonths}
 aria-label="Meses"
 className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 </div>
 <label className="inline-flex items-center gap-2 text-sm text-zinc-600">
 <input type="checkbox" name="isActive" defaultChecked={partner.isActive} />
 Activo
 </label>

 <button type="submit" className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 w-full px-4 py-2.5 text-sm font-medium">
 Guardar cambios
 </button>
 </form>

 <div className="space-y-6">
 <div>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Datos de cobro</h3>
 <p className="mt-1 text-xs text-zinc-400">
 {partner.payoutAlias || partner.payoutCbu
 ? "Podés cambiarlos. El vendedor también los carga desde su panel."
 : "Sin datos: el vendedor no tiene a dónde cobrar."}
 </p>
 <div className="mt-2">
 <PayoutFields
 partnerId={partner.partnerId}
 partnerName={partner.partnerName}
 defaultAlias={partner.payoutAlias}
 defaultCbu={partner.payoutCbu}
 />
 </div>
 </div>

 {shops.length > 0 ? (
 <div>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Sus locales</h3>
 <ul className="mt-2 space-y-1.5">
 {shops.map((shop) => (
 <li key={shop.shopId} className="flex items-center gap-2 text-sm text-zinc-600">
 <Store className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
 <span className="truncate">{shop.shopName}</span>
 <span className="ml-auto shrink-0 text-xs tabular-nums text-zinc-400">
 {shop.paymentsTracked}/{shop.commissionMonths}
 </span>
 </li>
 ))}
 </ul>
 </div>
 ) : null}
 </div>
 </div>
 </BaseModal>
 </>
 );
}
