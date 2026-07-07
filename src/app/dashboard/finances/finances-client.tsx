"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Users2,
  CheckCircle2,
  Vault,
} from "lucide-react";
import {
  fetchFinanceData,
  fetchStaffProduction,
  createStaffPreLiquidation,
  fetchStaffLiquidations,
  markStaffLiquidationPaid,
  fetchCashSession,
  openCashSession,
  closeCashSession,
  createCashMovement,
  fetchCashMovements,
  fetchStaffLiquidationItems,
  fetchCashSessionsHistory,
  type StaffProduction,
  type StaffLiquidationPreview,
  type StaffLiquidationListItem,
  type CashSessionSummary,
  type CashMovementItem,
} from "@/lib/dashboard/finances/finances-actions";
import { supabase } from "@/lib/supabase";
import CustomSelect from "@/components/ui/custom-select";

type Movement = {
  id: string;
  amount: number;
  description: string;
  created_at: string;
  type: "income" | "expense";
  status: string | null;
};

type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
};

type FinanceData = {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  appointmentsCount: number;
  recentMovements: Movement[];
  expenses: Expense[];
};

function actionError(result: unknown, fallback: string): string {
  if (result && typeof result === "object" && "error" in result) {
    const value = (result as { error?: unknown }).error;
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return fallback;
}

function getArgentinaDate(): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return `${get("year")}-${get("month").padStart(2, "0")}-${get("day").padStart(2, "0")}`;
}

function getMonthBounds(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  const from = `${dateStr.slice(0, 7)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function getWeekBounds(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00-03:00");
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  d.setUTCDate(d.getUTCDate() + 6);
  const to = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { from, to };
}

function Card({ title, icon, right, children }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ui-card rounded-3xl border border-slate-200/80 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-zinc-300">{icon}</span>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function FinancesClient({
  shopId,
  initialData,
  initialFrom,
  initialTo,
  initialError,
  initialStaffProduction = [],
  initialCashSession = null,
  initialCashMovements = [],
  initialCashSessionsHistory = [],
  initialStaffLiquidations = [],
  role = "owner",
  userId = "",
}: {
  shopId: string;
  initialData: FinanceData | null;
  initialFrom: string;
  initialTo: string;
  initialError: string | null;
  initialStaffProduction: StaffProduction[];
  initialCashSession: CashSessionSummary | null;
  initialCashMovements: CashMovementItem[];
  initialCashSessionsHistory: CashSessionSummary[];
  initialStaffLiquidations: StaffLiquidationListItem[];
  role: string;
  userId: string;
}) {
  const isOwnerOrAdmin = role !== "staff";
  const today = getArgentinaDate();
  const monthBounds = getMonthBounds(today);
  const weekBounds = getWeekBounds(today);

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [, startTransition] = useTransition();

  const [staffProduction, setStaffProduction] = useState<StaffProduction[]>(initialStaffProduction);
  const [liquidationResult, setLiquidationResult] = useState<StaffLiquidationPreview | null>(null);
  const [liquidations, setLiquidations] = useState<StaffLiquidationListItem[]>(initialStaffLiquidations);
  const [selectedStaffForLiquidation, setSelectedStaffForLiquidation] = useState("");
  const [cashMovementType, setCashMovementType] = useState("income");

  const [cashSession, setCashSession] = useState<CashSessionSummary | null>(initialCashSession);
  const [cashMovements, setCashMovements] = useState<CashMovementItem[]>(initialCashMovements);
  const [cashSessionsHistory, setCashSessionsHistory] = useState<CashSessionSummary[]>(initialCashSessionsHistory);
  const [cashLoading, setCashLoading] = useState(false);

  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const shopRef = useRef(shopId);
  const isFirstRender = useRef(true);
  const skipNextRealtimeRefresh = useRef(false);
  const realtimeCooldown = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    shopRef.current = shopId;
  }, [shopId]);

  async function refreshFinanceData(nextFrom: string, nextTo: string) {
    const sid = shopRef.current || undefined;
    startTransition(async () => {
      const result = await fetchFinanceData(nextFrom, nextTo, sid);
      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(actionError(result, "Error al cargar"));
      }
    });
  }

  async function refreshCashData(nextFrom: string, nextTo: string) {
    const sid = shopRef.current || undefined;
    setCashLoading(true);
    try {
      const [session, moves, history] = await Promise.all([
        fetchCashSession(sid),
        fetchCashMovements(nextFrom, nextTo, sid),
        fetchCashSessionsHistory(nextFrom, nextTo, sid),
      ]);
      if (session.success) setCashSession(session.data ?? null);
      if (moves.success && moves.data) setCashMovements(moves.data);
      if (history.success && history.data) setCashSessionsHistory(history.data);
    } catch {
      /* ignore */
    } finally {
      setCashLoading(false);
    }
  }

  async function refreshFinanceDataFast(nextFrom: string, nextTo: string) {
    const sid = shopRef.current || "";
    const [incomeRes, expensesRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("service_price, services:service_id(price)")
        .eq("shop_id", sid)
        .eq("status", "completed")
        .eq("is_paid", true)
        .gte("start_time", nextFrom)
        .lte("start_time", nextTo)
        .limit(500),
      supabase
        .from("finances")
        .select("id, amount, category, description, created_at, happened_at")
        .eq("shop_id", sid)
        .eq("type", "expense")
        .gte("happened_at", nextFrom)
        .lte("happened_at", nextTo)
        .order("happened_at", { ascending: true }),
    ]);
    if (!incomeRes.error && !expensesRes.error) {
      const totalIncome = (incomeRes.data || []).reduce((sum: number, apt: { service_price: number | null; services: { price: number } | null }) => {
        return sum + Number(apt.service_price ?? apt.services?.price ?? 0);
      }, 0);
      const totalExpenses = (expensesRes.data || []).reduce((sum: number, e: { amount: number }) => sum + Number(e.amount), 0);
      setData({
        totalIncome,
        totalExpenses,
        netBalance: totalIncome - totalExpenses,
        appointmentsCount: (incomeRes.data || []).length,
        recentMovements: [],
        expenses: (expensesRes.data || []).map((e: { id: string; amount: number; category: string; description: string | null; created_at: string | null }) => ({
          id: e.id,
          amount: Number(e.amount),
          category: e.category,
          description: e.description,
          created_at: e.created_at ?? "",
        })),
      });
    }
  }

  async function refreshCashDataFast(nextFrom: string, nextTo: string) {
    const sid = shopRef.current || "";
    try {
      const [sessionRes, movesRes, historyRes] = await Promise.all([
        supabase
          .from("cash_sessions")
          .select("id, status, opened_at, opening_amount, expected_amount, counted_amount, difference_amount")
          .eq("shop_id", sid)
          .eq("status", "open")
          .maybeSingle(),
        supabase
          .from("cash_movements")
          .select("id, movement_type, payment_method, amount, category, description, happened_at")
          .eq("shop_id", sid)
          .gte("happened_at", nextFrom)
          .lte("happened_at", nextTo)
          .order("happened_at", { ascending: false })
          .limit(50),
        supabase
          .from("cash_sessions")
          .select("id, status, opened_at, opening_amount, expected_amount, counted_amount, difference_amount")
          .eq("shop_id", sid)
          .gte("opened_at", nextFrom)
          .lte("opened_at", nextTo)
          .order("opened_at", { ascending: false })
          .limit(30),
      ]);
      if (!sessionRes.error && sessionRes.data) {
        setCashSession({
          id: sessionRes.data.id,
          status: sessionRes.data.status as "open" | "closed" | "cancelled",
          openedAt: sessionRes.data.opened_at,
          openingAmount: Number(sessionRes.data.opening_amount),
          expectedAmount: Number(sessionRes.data.expected_amount),
          countedAmount: sessionRes.data.counted_amount ? Number(sessionRes.data.counted_amount) : null,
          differenceAmount: sessionRes.data.difference_amount ? Number(sessionRes.data.difference_amount) : null,
          movementNet: 0,
          appointmentIncome: 0,
        });
      }
      if (!movesRes.error && movesRes.data) {
        setCashMovements(movesRes.data.map((m: { id: string; movement_type: string; payment_method: string; amount: number; category: string; description: string | null; happened_at: string }) => ({
          id: m.id,
          movementType: m.movement_type,
          paymentMethod: m.payment_method,
          amount: Number(m.amount),
          category: m.category,
          description: m.description,
          happenedAt: m.happened_at,
        })));
      }
      if (!historyRes.error && historyRes.data) {
        setCashSessionsHistory(historyRes.data.map((h: { id: string; status: string; opened_at: string; opening_amount: number; expected_amount: number | null; counted_amount: number | null; difference_amount: number | null }) => ({
          id: h.id,
          status: h.status as "open" | "closed" | "cancelled",
          openedAt: h.opened_at,
          openingAmount: Number(h.opening_amount),
          expectedAmount: Number(h.expected_amount),
          countedAmount: h.counted_amount ? Number(h.counted_amount) : null,
          differenceAmount: h.difference_amount ? Number(h.difference_amount) : null,
          movementNet: 0,
          appointmentIncome: 0,
        })));
      }
    } catch {
      /* ignore */
    }
  }

  async function triggerLoads(nextFrom: string, nextTo: string) {
    const sid = shopRef.current || undefined;

    startTransition(async () => {
      const result = await fetchFinanceData(nextFrom, nextTo, sid);
      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(actionError(result, "Error al cargar"));
      }
    });

    const staffPromise = (async () => {
      try {
        const [prod, liq] = await Promise.all([
          fetchStaffProduction(nextFrom, nextTo, sid),
          fetchStaffLiquidations(nextFrom, nextTo, sid),
        ]);
        if (prod.success && prod.data) {
          setStaffProduction(prod.data);
        } else {
          setStaffProduction([]);
          setError(actionError(prod, "No se pudo cargar el equipo"));
        }
        if (liq.success && liq.data) {
          setLiquidations(liq.data);
        } else {
          setLiquidations([]);
          if (!prod.success) {
            setError(actionError(liq, "No se pudieron cargar liquidaciones"));
          }
        }
      } catch {
        setStaffProduction([]);
        setLiquidations([]);
      }
    })();

    const cashPromise = refreshCashData(nextFrom, nextTo);

    await Promise.allSettled([staffPromise, cashPromise]);
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    triggerLoads(from, to);
  }, [from, to]);

  useEffect(() => {
    const channel = supabase
      .channel(`finances-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "finances", filter: `shop_id=eq.${shopId}` }, () => {
        if (skipNextRealtimeRefresh.current) { skipNextRealtimeRefresh.current = false; return; }
        if (realtimeCooldown.current) return;
        realtimeCooldown.current = true;
        setTimeout(() => { realtimeCooldown.current = false; }, 5000);
        refreshFinanceDataFast(from, to);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements", filter: `shop_id=eq.${shopId}` }, () => {
        if (skipNextRealtimeRefresh.current) { skipNextRealtimeRefresh.current = false; return; }
        if (realtimeCooldown.current) return;
        realtimeCooldown.current = true;
        setTimeout(() => { realtimeCooldown.current = false; }, 5000);
        refreshCashDataFast(from, to);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_sessions", filter: `shop_id=eq.${shopId}` }, () => {
        if (skipNextRealtimeRefresh.current) { skipNextRealtimeRefresh.current = false; return; }
        if (realtimeCooldown.current) return;
        realtimeCooldown.current = true;
        setTimeout(() => { realtimeCooldown.current = false; }, 5000);
        refreshCashDataFast(from, to);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, from, to]);

  function setQuickFeedback(msg: string) {
    setUiMessage(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      feedbackTimerRef.current = null;
      setUiMessage(null);
    }, 1600);
  }

  function applyRangeAndRefresh(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
  }

  async function handleCreatePreLiquidation(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusyKey("liq-create");
    const formData = new FormData(e.currentTarget);
    formData.set("period_start", from);
    formData.set("period_end", to);
    const res = await createStaffPreLiquidation(formData, shopId || undefined);
    setBusyKey(null);
    if (!res.success || !res.data) return setError(actionError(res, "No se pudo generar"));
    setLiquidationResult(res.data);
    setQuickFeedback("Pre-liquidacion creada");
    skipNextRealtimeRefresh.current = true;
    void triggerLoads(from, to);
  }

  async function handleMarkLiquidationPaid(liq: StaffLiquidationListItem) {
    setBusyKey(`liq-paid-${liq.id}`);
    const res = await markStaffLiquidationPaid(liq.id, liq.finalPayable, shopId || undefined);
    setBusyKey(null);
    if (!res.success) return setError(actionError(res, "No se pudo actualizar"));
    setQuickFeedback("Liquidacion pagada");
    skipNextRealtimeRefresh.current = true;
    void triggerLoads(from, to);
  }

  async function handleOpenLiquidationDetail(liqId: string) {
    const res = await fetchStaffLiquidationItems(liqId, shopId || undefined);
    if (!res.success || !res.data) return setError(actionError(res, "No se pudo cargar detalle"));
  }

  async function handleOpenCashSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusyKey("cash-open");
    const res = await openCashSession(new FormData(e.currentTarget), shopId || undefined);
    setBusyKey(null);
    if (!res.success) return setError(actionError(res, "No se pudo abrir caja"));
    setQuickFeedback("Caja abierta");
    skipNextRealtimeRefresh.current = true;
    void triggerLoads(from, to);
  }

  async function handleCloseCashSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cashSession) return;
    setBusyKey("cash-close");
    const formData = new FormData(e.currentTarget);
    formData.set("session_id", cashSession.id);
    const res = await closeCashSession(formData, shopId || undefined);
    setBusyKey(null);
    if (!res.success) return setError(actionError(res, "No se pudo cerrar caja"));
    setQuickFeedback("Caja cerrada");
    skipNextRealtimeRefresh.current = true;
    void triggerLoads(from, to);
  }

  async function handleCreateCashMovement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusyKey("cash-move-create");
    const res = await createCashMovement(new FormData(form), shopId || undefined);
    setBusyKey(null);
    if (!res.success) return setError(actionError(res, "No se pudo guardar movimiento"));
    form.reset();
    setQuickFeedback("Movimiento guardado");
    skipNextRealtimeRefresh.current = true;
    void triggerLoads(from, to);
  }

  const kpiExpected = cashSession?.expectedAmount ?? 0;
  const kpiCounted = cashSession?.countedAmount ?? 0;
  const kpiDiff = cashSession?.differenceAmount ?? 0;

  return (
    <div className="space-y-5">
      {isOwnerOrAdmin && (
        <>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight leading-none">Finanzas</h1>
        {uiMessage && <span className="ui-badge">{uiMessage}</span>}
        {error && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300">{error}</span>}
      </header>

      <div className="ui-card inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
        <button onClick={() => applyRangeAndRefresh(today, today)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">DIA</button>
        <button onClick={() => applyRangeAndRefresh(weekBounds.from, weekBounds.to)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">SEMANA</button>
        <button onClick={() => applyRangeAndRefresh(monthBounds.from, monthBounds.to)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">MES</button>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs" />
        <button onClick={() => applyRangeAndRefresh(from <= to ? from : to, from <= to ? to : from)} className="ui-btn-primary rounded-lg px-2.5 py-1.5 text-xs">Filtrar</button>
      </div>

      <div className="ui-card rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-zinc-400">Ingresos</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">${(data?.totalIncome ?? 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-zinc-400">Gastos</p>
            <p className="mt-1 text-lg font-bold text-red-500">${(data?.totalExpenses ?? 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-zinc-400">Balance</p>
            <p className={`mt-1 text-lg font-bold ${(data?.netBalance ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>${(data?.netBalance ?? 0).toFixed(2)}</p>
          </div>
        </div>
      </div>
        </>
      )}

      <Card title={isOwnerOrAdmin ? "Equipo" : "Mi Produccion"} icon={<Users2 className="h-4 w-4" />} right={undefined}>
        {isOwnerOrAdmin ? (
        <>
        {staffProduction.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <Users2 className="h-7 w-7 text-slate-400" />
            <button onClick={() => { setBusyKey("load-team"); triggerLoads(from, to).finally(() => setBusyKey(null)); }} className="ui-btn-primary rounded-xl px-4 py-2 text-sm">{busyKey === "load-team" ? "Cargando..." : "+ Cargar equipo"}</button>
          </div>
        ) : (
          <div>
            {/* Liquidar empleado */}
            <form onSubmit={handleCreatePreLiquidation} className="flex flex-wrap items-end gap-2 mb-4">
              <div className="min-w-0 flex-1">
                <CustomSelect
                  name="staff_user_id"
                  value={selectedStaffForLiquidation}
                  onChange={setSelectedStaffForLiquidation}
                  placeholder="Liquidar empleado..."
                  options={staffProduction.map((s) => ({ value: s.staffId, label: s.staffName }))}
                />
              </div>
              <button disabled={busyKey === "liq-create" || !selectedStaffForLiquidation} className="ui-btn-primary rounded-xl px-4 py-2.5 text-sm h-[42px]">{busyKey === "liq-create" ? "Calculando..." : "Calcular"}</button>
            </form>
            {liquidationResult && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm text-emerald-800 dark:text-emerald-200"><strong>{liquidationResult.staffName}</strong>: ${liquidationResult.finalPayable.toFixed(2)}</span>
              </div>
            )}

            {/* Tabla de produccion */}
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2 font-medium">Empleado</th><th className="font-medium">Turnos</th><th className="font-medium">Cobrado</th><th className="font-medium">Ticket</th></tr></thead>
                <tbody>{staffProduction.map((s) => <tr key={s.staffId} className="border-t border-slate-100 dark:border-zinc-800"><td className="py-2 font-medium text-slate-900 dark:text-white">{s.staffName}</td><td className="text-slate-700 dark:text-zinc-300">{s.appointmentsCount}</td><td className="text-emerald-600 font-semibold">${s.paidRevenue.toFixed(2)}</td><td className="text-slate-700 dark:text-zinc-300">${s.avgTicketPaid.toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>

            {/* Historial de liquidaciones */}
            {liquidations.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">Liquidaciones anteriores</p>
                <div className="space-y-1">
                  {liquidations.map((l) => (
                    <div key={l.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3.5 py-2.5 text-sm dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700 dark:text-zinc-300">{l.staffName}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">{l.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-600">${l.finalPayable.toFixed(2)}</span>
                        <button onClick={() => void handleOpenLiquidationDetail(l.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-zinc-700 dark:text-zinc-400">Detalle</button>
                        {l.status !== "paid" && <button onClick={() => void handleMarkLiquidationPaid(l)} disabled={busyKey === `liq-paid-${l.id}`} className="ui-btn-primary rounded-lg px-2.5 py-1 text-xs">{busyKey === `liq-paid-${l.id}` ? "..." : "Pagar"}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-2 font-medium">Empleado</th><th className="font-medium">Turnos</th><th className="font-medium">Cobrado</th><th className="font-medium">Ticket</th></tr></thead>
              <tbody>{staffProduction.filter(s => s.staffId === userId).map((s) => <tr key={s.staffId} className="border-t border-slate-100 dark:border-zinc-800"><td className="py-2 font-medium text-slate-900 dark:text-white">{s.staffName}</td><td className="text-slate-700 dark:text-zinc-300">{s.appointmentsCount}</td><td className="text-emerald-600 font-semibold">${s.paidRevenue.toFixed(2)}</td><td className="text-slate-700 dark:text-zinc-300">${s.avgTicketPaid.toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>

      {isOwnerOrAdmin && (
      <Card title="Caja" icon={<Vault className="h-4 w-4" />}>
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            cashSession?.status === "open"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cashSession?.status === "open" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            {cashSession?.status === "open" ? "Abierta" : "Cerrada"}
          </span>
          {cashSession && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              {new Date(cashSession.openedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {cashLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
        ) : (
          <div>
            <div className="text-center mb-5">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Esperado en caja</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">${kpiExpected.toFixed(2)}</p>
              {cashSession?.status === "open" && (
                <div className="mt-1.5 flex justify-center gap-3 text-[11px] text-slate-400 dark:text-zinc-500">
                  <span>Inicial: <strong className="text-slate-600 dark:text-zinc-300">${cashSession.openingAmount.toFixed(2)}</strong></span>
                  <span>Mov: <strong className="text-slate-600 dark:text-zinc-300">${cashSession.movementNet >= 0 ? "+" : ""}${cashSession.movementNet.toFixed(2)}</strong></span>
                  <span>Turnos: <strong className="text-slate-600 dark:text-zinc-300">+${cashSession.appointmentIncome.toFixed(2)}</strong></span>
                </div>
              )}
            </div>

            {cashSession?.status === "open" ? (
              <form onSubmit={handleCloseCashSession} className="flex gap-2">
                <input name="counted_amount" type="number" step="0.01" min="0" required placeholder="Efectivo contado al cierre" className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none ring-[#0071E3] focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
                <button disabled={busyKey === "cash-close"} className="ui-btn-primary rounded-xl px-5 py-2.5 text-sm min-h-[42px]">{busyKey === "cash-close" ? "Cerrando..." : "Cerrar caja"}</button>
              </form>
            ) : (
              <form onSubmit={handleOpenCashSession} className="flex gap-2">
                <input name="opening_amount" type="number" step="0.01" min="0" required placeholder="Efectivo inicial" className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none ring-[#0071E3] focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
                <button disabled={busyKey === "cash-open"} className="ui-btn-primary rounded-xl px-5 py-2.5 text-sm min-h-[42px]">{busyKey === "cash-open" ? "Abriendo..." : "Abrir caja"}</button>
              </form>
            )}

            {/* Movimiento rápido inline */}
            <form onSubmit={handleCreateCashMovement} className="mt-3 flex flex-wrap gap-2">
              <CustomSelect
                name="movement_type"
                value={cashMovementType}
                onChange={setCashMovementType}
                options={[{ value: "income", label: "Ingreso" }, { value: "expense", label: "Gasto" }, { value: "withdrawal", label: "Retiro" }]}
                className="min-w-[100px]"
              />
              <input name="category" required placeholder="Categoria" className="min-w-[100px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-[#0071E3] focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Monto" className="min-w-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-[#0071E3] focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <button disabled={busyKey === "cash-move-create"} className="ui-btn-primary rounded-xl px-3 py-2 text-sm min-h-[38px]">{busyKey === "cash-move-create" ? "..." : "Agregar"}</button>
            </form>

            {kpiCounted > 0 && (
              <div className={`mt-4 flex items-center justify-between rounded-xl border px-4 py-3 ${
                kpiDiff >= 0
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                  : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20"
              }`}>
                <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">Diferencia</span>
                <span className={`text-lg font-bold ${kpiDiff >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {kpiDiff >= 0 ? "+" : ""}${kpiDiff.toFixed(2)}
                </span>
              </div>
            )}

            {/* Movimientos recientes */}
            {cashMovements.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400">Movimientos recientes</p>
                <div className="space-y-1">
                  {cashMovements.slice(0, 5).map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <span className="text-slate-600 dark:text-zinc-400">{m.category}</span>
                      <span className={`font-semibold ${m.movementType === "income" ? "text-emerald-600" : "text-red-600"}`}>
                        {m.movementType === "income" ? "+" : "-"}${m.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cierres recientes */}
            {cashSessionsHistory.filter((s) => s.status === "closed").length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400">Cierres recientes</p>
                <div className="space-y-1">
                  {cashSessionsHistory.filter((s) => s.status === "closed").slice(0, 5).map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <span className="text-slate-600 dark:text-zinc-400">
                        {new Date(s.openedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                      </span>
                      <span className={`font-semibold ${(s.differenceAmount ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {(s.differenceAmount ?? 0) >= 0 ? "+" : ""}${(s.differenceAmount ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
      )}

    </div>
  );
}
