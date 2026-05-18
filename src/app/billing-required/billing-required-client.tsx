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
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Local: <span className="font-semibold">{shopName}</span></p>
      <div className="grid gap-2">
        {CYCLES.map((cycle) => (
          <button
            key={cycle}
            onClick={() => pay(cycle)}
            disabled={Boolean(loading)}
            className="inline-flex items-center justify-between rounded-xl bg-violet-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
          >
            <span>{BILLING_LABELS[cycle]}</span>
            <span>${BILLING_PRICES[cycle].toLocaleString("es-AR")}</span>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-gray-500">Incluye 2 dias de gracia despues del vencimiento.</p>
    </div>
  );
}
