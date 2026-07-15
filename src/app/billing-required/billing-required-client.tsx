"use client";

import { useEffect, useState } from "react";
import { BILLING_LABELS, BillingCycle } from "@/lib/billing/plans";

type Props = {
  shopId: string;
  shopName: string;
  monthlyPrice: number;
};

const CYCLES: BillingCycle[] = ["monthly"];
const HOVER_EMOJIS = ["🤑", "🫰", "💸", "💳", "💰", "🤑", "👛"];

export default function BillingRequiredClient({ shopId, shopName, monthlyPrice }: Props) {
  const [loading, setLoading] = useState<BillingCycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    if (!hovering) return;
    let frame = 0;
    const tick = () => {
      setSpin((prev) => (prev + 0.035) % (Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hovering]);

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
            onMouseEnter={(e) => {
              setHovering(true);
              setCursor({ x: e.clientX, y: e.clientY });
            }}
            onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHovering(false)}
            className="inline-flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white px-4 py-3.5 text-sm font-black tracking-wide shadow-[0_12px_24px_rgba(234,88,12,0.35)] hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 transition-all disabled:opacity-60"
          >
            <span>Renovar ahora · {BILLING_LABELS[cycle]}</span>
            <span>${monthlyPrice.toLocaleString("es-AR")}</span>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-orange-800">Tenés 2 días de changüí después del vencimiento.</p>

      {hovering && (
        <div className="pointer-events-none fixed inset-0 z-[120]" aria-hidden="true">
          {HOVER_EMOJIS.map((emoji, index) => {
            const angle = spin + (index / HOVER_EMOJIS.length) * Math.PI * 2;
            const radius = 48;
            const x = cursor.x + Math.cos(angle) * radius;
            const y = cursor.y + Math.sin(angle) * radius;
            return (
              <span
                key={`${emoji}-${index}`}
                className="fixed select-none text-2xl"
                style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
              >
                {emoji}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
