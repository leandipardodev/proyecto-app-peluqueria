"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import type { ReferredShopItem } from "@/lib/admin/referrals";

type Props = {
 shop: ReferredShopItem;
 partnerOptions: { id: string; name: string; referralCode: string; isActive: boolean }[];
 assignAction: (formData: FormData) => void | Promise<void>;
 unassignAction: (formData: FormData) => void | Promise<void>;
};

function money(value: number) {
 return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
 return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(
 new Date(value),
 );
}

/**
 * Un local referido, en un cuadrado. El detalle y las acciones viven en el
 * modal, asi el listado puede ser una grilla y no una tabla de 10 columnas.
 */
export default function ShopTile({ shop, partnerOptions, assignAction, unassignAction }: Props) {
 const [open, setOpen] = useState(false);
 const hasPayout = shop.pendingCommission > 0;

 return (
 <>
 <button
 type="button"
 onClick={() => setOpen(true)}
 className="flex aspect-square flex-col rounded-3xl border border-zinc-200/80 bg-white dark:bg-zinc-900 p-5 text-left transition hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm"
 >
 <Store className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
 <span className="mt-auto line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
 {shop.shopName}
 </span>
 <span className="mt-1 truncate text-xs text-zinc-400">{shop.partnerName}</span>
 <span className="mt-1 text-xs tabular-nums text-zinc-400">
 {shop.paymentsTracked}/{shop.commissionMonths} meses
 </span>
 <span
 className={`mt-1 text-sm font-semibold tabular-nums ${
 hasPayout ? "text-amber-600" : "text-zinc-300 dark:text-zinc-600"
 }`}
 >
 {hasPayout ? money(shop.pendingCommission) : "—"}
 </span>
 </button>

 <BaseModal
 open={open}
 onClose={() => setOpen(false)}
 title={shop.shopName}
 icon={<Store className="h-5 w-5" />}
 subtitle={`/${shop.shopSlug} · ${shop.industryName}`}
 maxWidth="md"
 >
 <div className="space-y-6 px-6 py-6">
 <dl className="grid grid-cols-2 gap-4 text-sm">
 <div>
 <dt className="text-[11px] uppercase tracking-wider text-zinc-400">Vendedor</dt>
 <dd className="text-zinc-700 dark:text-zinc-300">{shop.partnerName}</dd>
 </div>
 <div>
 <dt className="text-[11px] uppercase tracking-wider text-zinc-400">Regla al atribuir</dt>
 <dd className="text-zinc-700 dark:text-zinc-300 tabular-nums">
 {shop.commissionPercent}% × {shop.commissionMonths} meses
 </dd>
 </div>
 <div>
 <dt className="text-[11px] uppercase tracking-wider text-zinc-400">Pagos contados</dt>
 <dd className="text-zinc-700 dark:text-zinc-300 tabular-nums">{shop.paymentsTracked}</dd>
 </div>
 <div>
 <dt className="text-[11px] uppercase tracking-wider text-zinc-400">Pendiente</dt>
 <dd className="text-zinc-700 dark:text-zinc-300 tabular-nums">{money(shop.pendingCommission)}</dd>
 </div>
 <div className="col-span-2">
 <dt className="text-[11px] uppercase tracking-wider text-zinc-400">Atribuido</dt>
 <dd className="text-zinc-700 dark:text-zinc-300">{formatDate(shop.attributedAt)}</dd>
 </div>
 </dl>

 {/*
 Reasignar el MISMO vendedor no reinicia el reloj de comisión: el
 server corta con un no-op si el partner no cambio. El select viene
 con el actual justamente para que guardar sin tocar nada sea seguro.
 */}
 <form action={assignAction} className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-5">
 <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Cambiar vendedor</p>
 <input type="hidden" name="shopId" value={shop.shopId} />
 <select
 name="partnerId"
 defaultValue={shop.partnerId}
 className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
 >
 {partnerOptions.map((partner) => (
 <option key={partner.id} value={partner.id}>
 {partner.name} [{partner.referralCode}]{partner.isActive ? "" : " (inactivo)"}
 </option>
 ))}
 </select>
 <p className="text-xs text-zinc-400">
 Cambiar de vendedor reinicia los meses de comisión para este local. Si dejás el mismo, no pasa nada.
 </p>
 <button type="submit" className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 text-sm font-medium">
 Guardar
 </button>
 </form>

 <form action={unassignAction} className="border-t border-zinc-200 dark:border-zinc-800 pt-5">
 <input type="hidden" name="shopId" value={shop.shopId} />
 <button
 type="submit"
 className="text-sm text-rose-600 transition hover:text-rose-700"
 >
 Sacarle el vendedor a este local
 </button>
 <p className="mt-1 text-xs text-zinc-400">
 Las comisiones de este local que todavía no pagaste se cancelan. Las ya pagadas quedan en el
 historial.
 </p>
 </form>
 </div>
 </BaseModal>
 </>
 );
}
