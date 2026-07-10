"use client";

import { useState, useEffect } from "react";
import { CreditCard, Download, CheckCircle, XCircle, FileText, Repeat, Zap, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BillingEvent {
  id: string;
  type: string;
  amount: number;
  paymentId: string | null;
  createdAt: string;
}

interface SubscriptionInfo {
  status: string;
  nextChargeDate: string | null;
}

interface Props {
  shopId: string;
  shopName: string;
  planExpiry: string | null;
  active: boolean;
  subscription: SubscriptionInfo | null;
  events: BillingEvent[];
}

export default function BillingClient({ shopId, shopName, planExpiry, active, subscription, events }: Props) {
  const [loading, setLoading] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [subSuccess, setSubSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") === "success") {
      setSubSuccess(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handlePay = async () => {
    setPayError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, cycle: "monthly" }),
      });
      const data = await res.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        setPayError(data?.error || "Error al iniciar el pago");
      }
    } catch {
      setPayError("Error de red al conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleActivateSubscription = async () => {
    setSubError(null);
    setSubLoading(true);
    try {
      const res = await fetch("/api/billing/subscription/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      const data = await res.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        setSubError(data?.error || "Error al activar suscripción");
      }
    } catch {
      setSubError("Error de red al conectar con el servidor");
    } finally {
      setSubLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("¿Estás seguro? Se desactivará el pago automático mensual.")) return;
    setSubError(null);
    setSubLoading(true);
    try {
      const res = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.reload();
      } else {
        setSubError(data?.error || "Error al cancelar suscripción");
      }
    } catch {
      setSubError("Error de red al conectar con el servidor");
    } finally {
      setSubLoading(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const isExpired = planExpiry && new Date(planExpiry) < new Date();
  const hasActiveSubscription = subscription?.status === "authorized";

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-6">
      <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight leading-none">Facturación</h1>

      {subSuccess && (
        <div className="rounded-3xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 p-4 text-sm text-emerald-800 dark:text-emerald-200">
          ¡Suscripción automática activada correctamente! A partir de ahora el pago mensual se debitará automáticamente.
        </div>
      )}

      {/* Plan card */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/40">
            <CreditCard className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Plan Mensual</h2>
            <p className="text-sm text-gray-500 dark:text-zinc-400">$25.000 ARS / mes</p>
          </div>
          <div className="ml-auto">
            {active && !isExpired ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle className="w-3 h-3" /> Activo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                <XCircle className="w-3 h-3" /> Inactivo
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 dark:text-zinc-400">Vencimiento</p>
            <p className={`font-medium ${isExpired ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
              {formatDate(planExpiry)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-zinc-400">Próximo pago</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {isExpired ? "Vencido" : formatDate(planExpiry)}
            </p>
          </div>
        </div>

        {isExpired && !hasActiveSubscription && (
          <Button onClick={handlePay} disabled={loading} className="mt-4 w-full">
            {loading ? "Generando link..." : "Pagar suscripción"}
          </Button>
        )}
        {payError && <p className="mt-2 text-xs text-red-600">{payError}</p>}
      </div>

      {/* Automatic subscription card */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-full ${hasActiveSubscription ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-slate-100 dark:bg-zinc-800"}`}>
            <Repeat className={`w-5 h-5 ${hasActiveSubscription ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pago Automático</h2>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Débito mensual sin preocupaciones</p>
          </div>
          <div className="ml-auto">
            {hasActiveSubscription ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <Zap className="w-3 h-3" /> Activo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Inactivo
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-600 dark:text-zinc-400 mb-4">
          <p className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            Se debitan $25.000 ARS cada mes automáticamente
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            Podés cancelar en cualquier momento
          </p>
          {hasActiveSubscription && subscription?.nextChargeDate && (
            <p className="text-xs text-gray-500 dark:text-zinc-500 mt-2">
              Próximo cargo estimado: {formatDate(subscription.nextChargeDate)}
            </p>
          )}
        </div>

        {hasActiveSubscription ? (
          <Button onClick={handleCancelSubscription} disabled={subLoading} variant="outline" className="w-full border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
            {subLoading ? "Cancelando..." : "Cancelar suscripción automática"}
          </Button>
        ) : (
          <Button onClick={handleActivateSubscription} disabled={subLoading} className="w-full">
            {subLoading ? "Conectando con Mercado Pago..." : "Activar pago automático"}
          </Button>
        )}
        {subError && <p className="mt-2 text-xs text-red-600">{subError}</p>}
      </div>

      {/* Payment history */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Historial de pagos</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-8">No hay pagos registrados</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="flex items-center justify-between py-3 px-4 rounded-2xl bg-gray-50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {event.type === "subscription_payment_applied" ? "Pago de suscripción" : "Checkout iniciado"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">{formatDate(event.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    ${event.amount.toFixed(2)}
                  </span>
                  {event.type === "subscription_payment_applied" && (
                    <a
                      href={`/receipt/${event.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-zinc-600 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                    >
                      <Download className="w-3 h-3" />
                      Recibo
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
