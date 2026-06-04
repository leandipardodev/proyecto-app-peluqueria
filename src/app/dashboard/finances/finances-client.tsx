"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Users2,
  CheckCircle2,
  Vault,
  RefreshCw,
  ChevronDown,
  Download,
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
  type StaffLiquidationDetailItem,
} from "@/lib/dashboard/finances-actions";
import CustomSelect from "@/components/ui/custom-select";
import { downloadCsv } from "@/lib/csv-export";

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

function Card({ title, icon, right, children }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ui-card rounded-3xl border border-slate-200/80 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900/65">
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
}: {
  shopId: string;
  initialData: FinanceData | null;
  initialFrom: string;
  initialTo: string;
  initialError: string | null;
  initialStaffProduction: StaffProduction[];
}) {
  const today = getArgentinaDate();
  const monthBounds = getMonthBounds(today);

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [isPending, startTransition] = useTransition();

  const [staffProduction, setStaffProduction] = useState<StaffProduction[]>(initialStaffProduction);
  const [liquidationResult, setLiquidationResult] = useState<StaffLiquidationPreview | null>(null);
  const [liquidations, setLiquidations] = useState<StaffLiquidationListItem[]>([]);
  const [liquidationItems, setLiquidationItems] = useState<StaffLiquidationDetailItem[]>([]);
  const [selectedLiquidationId, setSelectedLiquidationId] = useState<string | null>(null);
  const [liquidationStatusFilter, setLiquidationStatusFilter] = useState<"all" | "draft" | "confirmed" | "paid">("all");
  const [selectedStaffForLiquidation, setSelectedStaffForLiquidation] = useState("");
  const [cashMovementType, setCashMovementType] = useState("income");
  const [cashPaymentMethod, setCashPaymentMethod] = useState("cash");

  const [cashSession, setCashSession] = useState<CashSessionSummary | null>(null);
  const [cashMovements, setCashMovements] = useState<CashMovementItem[]>([]);
  const [cashSessionsHistory, setCashSessionsHistory] = useState<CashSessionSummary[]>([]);
  const [cashLoading, setCashLoading] = useState(false);

  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showLiquidationsHistory, setShowLiquidationsHistory] = useState(false);
  const [showMovements, setShowMovements] = useState(false);
  const [showClosures, setShowClosures] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  const shopRef = useRef(shopId);

  useEffect(() => {
    shopRef.current = shopId;
  }, [shopId]);

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

    const cashPromise = (async () => {
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
        /* silently ignore */
      } finally {
        setCashLoading(false);
      }
    })();

    await Promise.allSettled([staffPromise, cashPromise]);
  }

  useEffect(() => {
    triggerLoads(from, to);
  }, [from, to]);

  useEffect(() => {
    if (refreshTimerRef.current) {
      window.clearInterval(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setInterval(() => {
      if (!document.hidden) triggerLoads(from, to);
    }, 30000);
    return () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
      }
    };
  }, [from, to]);

  const filteredLiquidations = useMemo(
    () => liquidations.filter((l) => liquidationStatusFilter === "all" || l.status === liquidationStatusFilter),
    [liquidationStatusFilter, liquidations],
  );

  function setQuickFeedback(msg: string) {
    setUiMessage(msg);
    window.setTimeout(() => setUiMessage(null), 1600);
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
    void triggerLoads(from, to);
  }

  async function handleMarkLiquidationPaid(liq: StaffLiquidationListItem) {
    setBusyKey(`liq-paid-${liq.id}`);
    const res = await markStaffLiquidationPaid(liq.id, liq.finalPayable, shopId || undefined);
    setBusyKey(null);
    if (!res.success) return setError(actionError(res, "No se pudo actualizar"));
    setQuickFeedback("Liquidacion pagada");
    void triggerLoads(from, to);
  }

  async function handleOpenLiquidationDetail(liqId: string) {
    setSelectedLiquidationId(liqId);
    const res = await fetchStaffLiquidationItems(liqId, shopId || undefined);
    if (!res.success || !res.data) return setError(actionError(res, "No se pudo cargar detalle"));
    setLiquidationItems(res.data);
  }

  async function handleOpenCashSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusyKey("cash-open");
    const res = await openCashSession(new FormData(e.currentTarget), shopId || undefined);
    setBusyKey(null);
    if (!res.success) return setError(actionError(res, "No se pudo abrir caja"));
    setQuickFeedback("Caja abierta");
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
    void triggerLoads(from, to);
  }

  const kpiExpected = cashSession?.expectedAmount ?? 0;
  const kpiCounted = cashSession?.countedAmount ?? 0;
  const kpiDiff = cashSession?.differenceAmount ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Finanzas</h1>
        {uiMessage && <span className="ui-badge">{uiMessage}</span>}
        {error && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300">{error}</span>}
        {data && (
          <button onClick={() => downloadCsv([{ ingresos: data.totalIncome, gastos: data.totalExpenses, balance: data.netBalance }], [
            { key: "ingresos", label: "Ingresos" },
            { key: "gastos", label: "Gastos" },
            { key: "balance", label: "Balance" },
          ], "finanzas")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-zinc-600 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        )}
      </header>

      <div className="ui-card inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900/65">
        <button onClick={() => applyRangeAndRefresh(today, today)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">DIA</button>
        <button onClick={() => applyRangeAndRefresh(monthBounds.from, monthBounds.to)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">MES</button>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs" />
        <button onClick={() => applyRangeAndRefresh(from <= to ? from : to, from <= to ? to : from)} className="ui-btn-primary rounded-lg px-2.5 py-1.5 text-xs">Filtrar</button>
        <button onClick={() => applyRangeAndRefresh(from, to)} className="ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs">
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      <div className="ui-card rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/65">
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

      <Card title="Pagar a empleados" icon={<CheckCircle2 className="h-4 w-4" />}>
          <p className="mb-2 text-xs text-slate-500">Elegi el empleado y calculamos cuanto le corresponde en este rango.</p>
          <form onSubmit={handleCreatePreLiquidation} className="grid gap-2">
            <CustomSelect
              name="staff_user_id"
              value={selectedStaffForLiquidation}
              onChange={setSelectedStaffForLiquidation}
              placeholder="Empleado..."
              options={staffProduction.map((s) => ({ value: s.staffId, label: s.staffName }))}
            />
            <button disabled={busyKey === "liq-create" || !selectedStaffForLiquidation} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busyKey === "liq-create" ? "Calculando..." : "Calcular pago"}</button>
            {liquidationResult && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{liquidationResult.staffName}: ${liquidationResult.finalPayable.toFixed(2)}</p>}
          </form>
      </Card>

      <button onClick={() => setShowLiquidationsHistory((v) => !v)} className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900/70">
        <span>Historial de liquidaciones</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${showLiquidationsHistory ? "rotate-180" : ""}`} />
      </button>

      {showLiquidationsHistory && <Card title="Liquidaciones" icon={<CheckCircle2 className="h-4 w-4" />}>
        <div className="mb-3">
          <CustomSelect
            value={liquidationStatusFilter}
            onChange={(v) => setLiquidationStatusFilter(v as "all" | "draft" | "confirmed" | "paid")}
            options={[{ value: "all", label: "Todos" }, { value: "draft", label: "Borrador" }, { value: "confirmed", label: "Confirmada" }, { value: "paid", label: "Pagada" }]}
            className="max-w-[180px]"
          />
        </div>
        {filteredLiquidations.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 dark:border-zinc-700 dark:bg-zinc-900/40">
            <CheckCircle2 className="h-7 w-7 text-slate-400" />
            <p className="text-xs text-slate-500">Todavia no hay liquidaciones en este rango.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLiquidations.map((l) => (
              <div key={l.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <p className="font-medium">{l.staffName}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{l.status}</span>
                  <span className="font-semibold text-emerald-600">${l.finalPayable.toFixed(2)}</span>
                  <button onClick={() => void handleOpenLiquidationDetail(l.id)} className="ml-auto rounded-lg border px-2 py-1 text-xs">Detalle</button>
                  {l.status !== "paid" && <button onClick={() => void handleMarkLiquidationPaid(l)} disabled={busyKey === `liq-paid-${l.id}`} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white">{busyKey === `liq-paid-${l.id}` ? "..." : "Pagar"}</button>}
                </div>
                {selectedLiquidationId === l.id && liquidationItems.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs dark:border-zinc-800">
                    {liquidationItems.map((it) => (
                      <div key={it.id} className="flex items-center justify-between"><span>{it.serviceName}</span><span className="text-emerald-600">${it.commissionAmount.toFixed(2)}</span></div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>}

      <Card title="Caja" icon={<Vault className="h-4 w-4" />}>
        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 dark:border-zinc-700/80 dark:bg-gradient-to-br dark:from-zinc-900 dark:to-zinc-950">
          {cashLoading ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="mx-auto mb-1 h-3 w-16 animate-pulse rounded bg-slate-200 dark:bg-zinc-700" />
                  <div className="mx-auto h-6 w-20 animate-pulse rounded bg-slate-200 dark:bg-zinc-700" />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[11px] uppercase text-slate-500 dark:text-zinc-400">Esperado</p><p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">${kpiExpected.toFixed(2)}</p></div>
                <div><p className="text-[11px] uppercase text-slate-500 dark:text-zinc-400">Contado</p><p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">${kpiCounted.toFixed(2)}</p></div>
                <div><p className="text-[11px] uppercase text-slate-500 dark:text-zinc-400">Diferencia</p><p className={`mt-1 text-lg font-bold ${kpiDiff >= 0 ? "text-emerald-600" : "text-red-500"}`}>${kpiDiff.toFixed(2)}</p></div>
              </div>
              {cashSession?.status === "open" && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-zinc-400">
                  <span>Inicial: <strong className="text-slate-700 dark:text-zinc-200">${cashSession.openingAmount.toFixed(2)}</strong></span>
                  <span>Movimientos: <strong className="text-slate-700 dark:text-zinc-200">${cashSession.movementNet >= 0 ? "+" : ""}{cashSession.movementNet.toFixed(2)}</strong></span>
                  <span>Turnos: <strong className="text-slate-700 dark:text-zinc-200">+${cashSession.appointmentIncome.toFixed(2)}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={handleOpenCashSession} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/55">
            <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">Arrancá el dia con el efectivo inicial.</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input name="opening_amount" type="number" step="0.01" min="0" required placeholder="Monto inicial" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <button disabled={!!cashSession || busyKey === "cash-open"} className="ui-btn-primary rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50">{busyKey === "cash-open" ? "Abriendo..." : "Abrir caja"}</button>
            </div>
          </form>

          <form onSubmit={handleCloseCashSession} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/55">
            <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">Poné lo contado y cerramos el dia.</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input name="counted_amount" type="number" step="0.01" min="0" required placeholder="Monto contado" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <button disabled={!cashSession || busyKey === "cash-close"} className="ui-btn-primary rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50">{busyKey === "cash-close" ? "Cerrando..." : "Cerrar caja"}</button>
            </div>
          </form>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/55">
          <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">Movimientos rapidos de caja.</p>
          <form onSubmit={handleCreateCashMovement} className="grid gap-2 md:grid-cols-5">
            <CustomSelect
              name="movement_type"
              value={cashMovementType}
              onChange={setCashMovementType}
              options={[{ value: "income", label: "Ingreso" }, { value: "expense", label: "Gasto" }, { value: "withdrawal", label: "Retiro" }]}
            />
            <CustomSelect
              name="payment_method"
              value={cashPaymentMethod}
              onChange={setCashPaymentMethod}
              options={[{ value: "cash", label: "Efectivo" }, { value: "transfer", label: "Transferencia" }]}
            />
            <input name="category" required placeholder="Categoria" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Monto" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
            <button disabled={busyKey === "cash-move-create"} className="ui-btn-primary rounded-xl px-3 py-2.5 text-sm font-medium disabled:opacity-50">{busyKey === "cash-move-create" ? "Guardando..." : "Agregar"}</button>
          </form>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/55">
            <button onClick={() => setShowMovements((v) => !v)} className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-sm font-semibold">
              <span>Ultimos movimientos</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showMovements ? "rotate-180" : ""}`} />
            </button>
            {showMovements && (cashMovements.length === 0 ? <div className="mt-2 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-zinc-700">Todavia no cargaste movimientos</div> : <div className="mt-2 space-y-2">{cashMovements.slice(0, 8).map((m) => <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2 text-xs dark:border-zinc-800"><span>{m.category}</span><span className={m.movementType === "income" ? "text-emerald-600" : "text-red-500"}>{m.movementType === "income" ? "+" : "-"}${m.amount.toFixed(2)}</span></div>)}</div>)}
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/55">
            <button onClick={() => setShowClosures((v) => !v)} className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-sm font-semibold">
              <span>Ultimos cierres</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showClosures ? "rotate-180" : ""}`} />
            </button>
            {showClosures && (cashSessionsHistory.filter((s) => s.status === "closed").length === 0 ? <div className="mt-2 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-zinc-700">Todavia no cerraste caja</div> : <div className="mt-2 space-y-2">{cashSessionsHistory.filter((s) => s.status === "closed").map((s) => <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2 text-xs dark:border-zinc-800"><span>{new Date(s.openedAt).toLocaleDateString("es-AR")}</span><span className={(s.differenceAmount ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}>${(s.differenceAmount ?? 0).toFixed(2)}</span></div>)}</div>)}
          </div>
        </div>
      </Card>

      <Card title="Equipo" icon={<Users2 className="h-4 w-4" />}>
        {staffProduction.length === 0 ? (
          <div className="flex min-h-[130px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 dark:border-zinc-700 dark:bg-zinc-900/40">
            <Users2 className="h-7 w-7 text-slate-400" />
            <button onClick={() => { setBusyKey("load-team"); triggerLoads(from, to).finally(() => setBusyKey(null)); }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">{busyKey === "load-team" ? "Cargando..." : "+ Cargar equipo"}</button>
          </div>
        ) : (
          <div>
            <div className="flex justify-end mb-2">
              <button onClick={() => downloadCsv(staffProduction, [
                { key: "staffName", label: "Empleado" },
                { key: "appointmentsCount", label: "Turnos" },
                { key: (s) => s.paidRevenue.toFixed(2), label: "Cobrado" },
                { key: (s) => s.avgTicketPaid.toFixed(2), label: "Ticket" },
              ], "produccion-empleados")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition">
                <Download className="w-3 h-3" />
                CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2">Empleado</th><th>Turnos</th><th>Cobrado</th><th>Ticket</th></tr></thead>
                <tbody>{staffProduction.map((s) => <tr key={s.staffId} className="border-t border-slate-100 dark:border-zinc-800"><td className="py-2 font-medium">{s.staffName}</td><td>{s.appointmentsCount}</td><td className="text-emerald-600">${s.paidRevenue.toFixed(2)}</td><td>${s.avgTicketPaid.toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
