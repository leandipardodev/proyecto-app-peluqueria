"use client";

import { useState } from "react";
import { BILLING_LABELS, BillingCycle, BILLING_PRICES } from "@/lib/billing/plans";

type Props = {
  shopId: string;
  shopName: string;
};

const CYCLES: BillingCycle[] = ["monthly"];

export default function BillingRequiredClient({ shopId, shopName }: Props) {
  const [loading, setLoading] = useState<BillingCycle | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(cycle: BillingCycle) {
    setError(null);
    setLoading(cycle);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, cycle }),
      });
      const json = await res.json();
      if (!res.ok || !json?.init_point) {
        setError(json?.error || "No se pudo iniciar el pago");
        setLoading(null);
        return;
      }
      window.location.href = json.init_point;
    } catch {
      setError("Error al iniciar el pago");
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border-2 border-orange-200 bg-white/90 p-4 md:p-5 shadow-[0_10px_30px_rgba(251,146,60,0.15)]">
      <p className="text-sm text-orange-800">Colega: <span className="font-black text-zinc-900">{shopName}</span></p>
      <div className="grid gap-2">
        {CYCLES.map((cycle) => (
          <button
            key={cycle}
            type="button"
            onClick={() => pay(cycle)}
            disabled={Boolean(loading)}
            className="inline-flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white px-4 py-3.5 text-sm font-black tracking-wide shadow-[0_12px_24px_rgba(234,88,12,0.35)] hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 transition-all disabled:opacity-60"
          >
            <span>Renovar ahora · {BILLING_LABELS[cycle]}</span>
            <span>${BILLING_PRICES[cycle].toLocaleString("es-AR")}</span>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-orange-800">Tenés 2 días de changüí después del vencimiento.</p>
    </div>
  );
}
