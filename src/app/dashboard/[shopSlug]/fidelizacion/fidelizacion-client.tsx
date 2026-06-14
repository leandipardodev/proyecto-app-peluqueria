"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gift, Save, Trophy, Users } from "lucide-react";
import { runLoyaltyRaffleAction, updateLoyaltyProgramAction } from "@/lib/dashboard/business-actions";
import VouchersClient from "../vouchers/vouchers-client";
import type { VoucherRow } from "@/lib/dashboard/voucher-actions";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";

type LoyaltyRewardCustomer = {
  id: string;
  nombre: string | null;
  loyalty_rewards_available: number | null;
};

type Props = {
  shopId: string;
  vouchers: VoucherRow[];
  voucherTemplate?: string;
  loyaltyEnabled: boolean;
  loyaltyCutsRequired: number;
  loyaltyDiscountPercent: number;
  loyaltyRewardCustomers: LoyaltyRewardCustomer[];
};

export default function FidelizacionClient({
  shopId,
  vouchers,
  voucherTemplate,
  loyaltyEnabled,
  loyaltyCutsRequired,
  loyaltyDiscountPercent,
  loyaltyRewardCustomers,
}: Props) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerWord = INDUSTRY_CONFIG[industry].labels.customerSingular;
  const customerWordLower = customerWord.toLowerCase();
  const [enabled, setEnabled] = useState(loyaltyEnabled);
  const [cutsRequired, setCutsRequired] = useState(String(loyaltyCutsRequired));
  const [discountPercent, setDiscountPercent] = useState(String(loyaltyDiscountPercent));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showRafflePanel, setShowRafflePanel] = useState(false);
  const [rafflePrizeName, setRafflePrizeName] = useState("Corte gratis");
  const [raffleMessage, setRaffleMessage] = useState<string | null>(null);
  const [raffleResult, setRaffleResult] = useState<{ prizeName: string; participants: number; winner: { id: string; nombre: string }; candidateNames: string[] } | null>(null);
  const [raffleAnimating, setRaffleAnimating] = useState(false);
  const [raffleDisplayName, setRaffleDisplayName] = useState<string>("-");
  const [raffleSpinKey, setRaffleSpinKey] = useState(0);
  const [winnerBurst, setWinnerBurst] = useState(false);
  const [birthdayDiscount, setBirthdayDiscount] = useState("15");
  const raffleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (raffleTimerRef.current) {
        window.clearTimeout(raffleTimerRef.current);
      }
    };
  }, []);
  const totalRewardsAvailable = loyaltyRewardCustomers.reduce(
    (sum, c) => sum + Math.max(0, Number(c.loyalty_rewards_available || 0)),
    0
  );

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

  function handleRunRaffle() {
    setRaffleMessage(null);
    startTransition(async () => {
      const result = await runLoyaltyRaffleAction(
        rafflePrizeName,
        1
      );
      if (!result.success || !result.data) {
        setRaffleResult(null);
        setRaffleMessage(result.success ? "No se pudo ejecutar el sorteo." : result.error);
        return;
      }

      if (raffleTimerRef.current) {
        window.clearTimeout(raffleTimerRef.current);
      }

      const raffleData = result.data;
      const candidates = raffleData.candidateNames.length > 0
        ? raffleData.candidateNames
        : [raffleData.winner.nombre];

      setRaffleResult(raffleData);
      setRaffleAnimating(true);
      setWinnerBurst(false);

      let tick = 0;
      const maxTicks = 26;

      const spin = () => {
        tick += 1;
        const randomName = candidates[Math.floor(Math.random() * candidates.length)] || customerWord;
        setRaffleDisplayName(randomName);
        setRaffleSpinKey((prev) => prev + 1);

        if (tick >= maxTicks) {
          setRaffleDisplayName(raffleData.winner.nombre);
          setRaffleSpinKey((prev) => prev + 1);
          setRaffleAnimating(false);
          setRaffleMessage("Sorteo realizado con exito.");
          setWinnerBurst(true);
          window.setTimeout(() => setWinnerBurst(false), 1400);
          raffleTimerRef.current = null;
          return;
        }

        const delay = Math.min(340, 60 + tick * 11);
        raffleTimerRef.current = window.setTimeout(spin, delay);
      };

      spin();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[1.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors bg-white dark:bg-zinc-900">
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-amber-500/15">
              <Trophy className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Canjes listos para aplicar</h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Destacados por cantidad disponible</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100/75 dark:bg-amber-900/25 border border-amber-200/70 dark:border-amber-700/40 px-3 py-1.5">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Total canjes: {totalRewardsAvailable}</span>
            </div>
            {loyaltyRewardCustomers.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Todavia no hay {customerWordLower}s con canje disponible.</p>
            ) : (
              <div className="space-y-2">
                {loyaltyRewardCustomers.slice(0, 5).map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between rounded-xl border border-amber-200/70 dark:border-amber-700/40 bg-amber-50/70 dark:bg-amber-900/20 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-amber-900 dark:text-amber-100 truncate pr-2">
                      {customer.nombre || `${customerWord} sin nombre`}
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-500 text-white text-xs font-semibold px-2 py-0.5">
                      {Math.max(0, Number(customer.loyalty_rewards_available || 0))} canje(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors bg-white dark:bg-zinc-900">
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-cyan-500/15">
              <Users className="w-4.5 h-4.5 text-cyan-600" />
            </div>
            <div>
               <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Realizar sorteo entre {customerWordLower}s</h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Tarjeta de acceso rapido</p>
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
               Usa este bloque para lanzar dinamicas con tus {customerWordLower}s frecuentes y aumentar recurrencia.
            </p>
            <button
              type="button"
              onClick={() => setShowRafflePanel((prev) => !prev)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-600 text-white px-4 py-2 text-sm font-medium hover:bg-cyan-700 transition-colors"
            >
              <Gift className="w-4 h-4" />
              {showRafflePanel ? "Ocultar sorteo" : `Realizar sorteo entre ${customerWordLower}s`}
            </button>

            {showRafflePanel && (
              <div className="mt-4 rounded-2xl border border-cyan-200/70 dark:border-cyan-700/40 bg-cyan-50/70 dark:bg-cyan-900/20 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="px-1 text-xs text-cyan-900/80 dark:text-cyan-100/80">Premio</label>
                    <input
                      value={rafflePrizeName}
                      onChange={(e) => setRafflePrizeName(e.target.value)}
                      className="mt-1 w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-gray-900 dark:text-white"
                      placeholder="Ej: Corte gratis"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-cyan-900/80 dark:text-cyan-100/80">El sorteo elige clientes al azar sin repetir.</p>
                  <button
                    type="button"
                    onClick={handleRunRaffle}
                    disabled={pending || raffleAnimating}
                    className="inline-flex items-center gap-2 rounded-full bg-cyan-600 text-white px-4 py-2 text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
                  >
                    <Trophy className="w-4 h-4" />
                    {pending || raffleAnimating ? "Sorteando..." : "Sortear ahora"}
                  </button>
                </div>

                {raffleMessage && <p className="text-sm text-cyan-900 dark:text-cyan-100">{raffleMessage}</p>}

                {raffleResult && (
                  <div className="rounded-xl border border-cyan-200 dark:border-cyan-700 bg-white dark:bg-zinc-900 p-3">
                    <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">Resultado: {raffleResult.prizeName}</p>
                    <div className="mt-3 rounded-xl border border-cyan-200/70 dark:border-cyan-700/40 bg-cyan-100/60 dark:bg-cyan-800/20 p-3 min-h-[96px]">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-800/75 dark:text-cyan-100/75">Sorteando...</p>
                      <div className="mt-1 h-8 overflow-visible rounded-lg bg-white dark:bg-zinc-800 border border-cyan-200 dark:border-cyan-700 px-2 relative">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.p
                            key={`${raffleDisplayName}-${raffleSpinKey}`}
                            className={`absolute inset-0 grid place-items-center text-base font-semibold tracking-tight ${raffleAnimating ? "text-cyan-900 dark:text-cyan-100" : "text-emerald-700 dark:text-emerald-300"}`}
                            initial={{ y: -22, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 22, opacity: 0 }}
                            transition={{ duration: raffleAnimating ? 0.24 : 0.34, ease: [0.22, 1, 0.36, 1] }}
                          >
                            {raffleDisplayName}
                          </motion.p>
                        </AnimatePresence>
                        <AnimatePresence>
                          {winnerBurst && (
                            <>
                              {["🎉", "✨", "🥳", "🎊", "⭐", "💥", "🏆", "🔥", "🌟", "🙌", "🎇", "🎆"].map((emoji, idx) => {
                                const vectors = [
                                  { x: -96, y: -44 },
                                  { x: -72, y: 18 },
                                  { x: -40, y: -62 },
                                  { x: -20, y: 58 },
                                  { x: 18, y: -70 },
                                  { x: 42, y: 54 },
                                  { x: 64, y: -22 },
                                  { x: 92, y: 16 },
                                  { x: -110, y: -8 },
                                  { x: 108, y: -6 },
                                  { x: -54, y: 70 },
                                  { x: 56, y: 72 },
                                ];
                                const vector = vectors[idx % vectors.length];
                                return (
                                <motion.span
                                  key={`${emoji}-${idx}`}
                                  className="pointer-events-none absolute text-base"
                                  style={{ left: "50%", top: "50%" }}
                                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.75 }}
                                  animate={{
                                    x: vector.x,
                                    y: vector.y,
                                    opacity: 1,
                                    scale: 1.15,
                                  }}
                                  exit={{ opacity: 0, scale: 0.85 }}
                                  transition={{ duration: 0.85, delay: idx * 0.025, ease: [0.22, 1, 0.36, 1] }}
                                >
                                  {emoji}
                                </motion.span>
                                );
                              })}
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[1.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors bg-white dark:bg-zinc-900">
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-pink-500/15">
              <Gift className="w-4.5 h-4.5 text-pink-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Descuento de cumpleanos</h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Define el beneficio por cumpleanos</p>
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="px-1 text-xs text-zinc-600 dark:text-zinc-300">Descuento</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-500 dark:text-zinc-300">%</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={birthdayDiscount}
                  onChange={(e) => setBirthdayDiscount(e.target.value)}
                  className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 pl-8 pr-4 py-2.5 text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="md:col-span-2 flex items-end">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">El descuento se aplica automaticamente al agendar en el mes del cumpleanos. El mensaje de WhatsApp se configura en Comunicaciones.</p>
            </div>
          </div>
        </div>

        <div>
      <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors bg-white dark:bg-zinc-900">
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
                className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-gray-900 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 pl-8 pr-4 py-2.5 text-sm text-gray-900 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
        </div>
      </div>

      <VouchersClient shopId={shopId} initialVouchers={vouchers} initialTemplate={voucherTemplate} />
    </div>
  );
}
