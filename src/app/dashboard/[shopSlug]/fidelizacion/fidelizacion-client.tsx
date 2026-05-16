"use client";

import { useState, useTransition } from "react";
import { Gift, Save } from "lucide-react";
import { updateLoyaltyProgramAction } from "@/lib/dashboard/business-actions";
import VouchersClient from "../vouchers/vouchers-client";
import type { VoucherRow } from "@/lib/dashboard/voucher-actions";

type Props = {
  shopId: string;
  vouchers: VoucherRow[];
  voucherTemplate?: string;
  loyaltyEnabled: boolean;
  loyaltyCutsRequired: number;
  loyaltyDiscountPercent: number;
};

export default function FidelizacionClient({
  shopId,
  vouchers,
  voucherTemplate,
  loyaltyEnabled,
  loyaltyCutsRequired,
  loyaltyDiscountPercent,
}: Props) {
  const [enabled, setEnabled] = useState(loyaltyEnabled);
  const [cutsRequired, setCutsRequired] = useState(String(loyaltyCutsRequired));
  const [discountPercent, setDiscountPercent] = useState(String(loyaltyDiscountPercent));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateLoyaltyProgramAction(
        enabled,
        Math.max(1, Number(cutsRequired) || 1),
        Math.max(0, Math.min(100, Number(discountPercent) || 0))
      );
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setMessage("Fidelizacion guardada.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="p-2 rounded-full bg-violet-500/15">
            <Gift className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Fidelizacion</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Configura canjes por cantidad de cortes</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl border border-violet-200/60 dark:border-violet-700/40 bg-violet-50/70 dark:bg-violet-900/20 px-4 py-3 text-sm text-violet-900 dark:text-violet-200">
            <p className="font-medium">Como funciona</p>
            <p className="mt-1 text-xs text-violet-800/90 dark:text-violet-200/90">
              Cuando un cliente completa la cantidad de cortes definida, gana un canje automatico. Ese canje aplica el porcentaje de descuento que configures abajo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setEnabled((prev) => !prev)}
            className={`w-full sm:w-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
              enabled
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : "bg-zinc-100 text-zinc-700 border-zinc-300"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-zinc-400"}`} />
            {enabled ? "Programa activo" : "Programa pausado"}
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <input
                type="number"
                min={1}
                value={cutsRequired}
                onChange={(e) => setCutsRequired(e.target.value)}
                className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-4 py-2.5 text-sm text-gray-900 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="Cortes requeridos"
              />
              <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">Cortes necesarios para la recompensa.</p>
            </div>
            <div className="space-y-1.5">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-500 dark:text-zinc-300">%</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 pl-8 pr-4 py-2.5 text-sm text-gray-900 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="Descuento"
                />
              </div>
              <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">Descuento aplicado cuando se usa la recompensa.</p>
            </div>
          </div>

          {message && <p className="text-sm text-zinc-700 dark:text-zinc-300">{message}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {pending ? "Guardando..." : "Guardar fidelizacion"}
            </button>
          </div>
        </div>
      </div>

      <VouchersClient shopId={shopId} initialVouchers={vouchers} initialTemplate={voucherTemplate} />
    </div>
  );
}
