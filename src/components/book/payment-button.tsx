"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

interface PaymentButtonProps {
  serviceId: string;
}

export default function PaymentButton({ serviceId }: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePayment() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al generar el pago");
        return;
      }

      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handlePayment}
        disabled={loading}
        className="mt-2 block w-full text-center px-4 py-2 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 rounded-lg text-sm font-medium hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors cursor-pointer select-none disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generando link...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <CreditCard className="w-4 h-4" />
            Pagar con Mercado Pago
          </span>
        )}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}
