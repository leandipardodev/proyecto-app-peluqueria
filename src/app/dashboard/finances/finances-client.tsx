"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Users2, CheckCircle2, ArrowLeftRight, ChevronRight } from "lucide-react";
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
  fetchCashSessionsHistory,
  type StaffProduction,
  type StaffLiquidationPreview,
  type StaffLiquidationListItem,
  type CashSessionSummary,
  type CashMovementItem,
} from "@/lib/dashboard/finances/finances-actions";
import { normalizeRange } from "@/lib/dashboard/finances/date-range";
import CustomSelect from "@/components/ui/custom-select";
import BaseModal from "@/components/ui/modal";
import PageTitle from "@/components/ui/page-title";

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

function Card({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ui-card rounded-3xl border border-slate-200/80 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && <span className="p-2 rounded-full bg-slate-500/15 text-slate-600 dark:text-slate-400">{icon}</span>}
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** El estado crudo de la base no le dice nada a nadie: `draft` no es una palabra de salon. */
const LIQUIDATION_STATUS_LABEL: Record<string, string> = {
  draft: "Pendiente",
  pending: "Pendiente",
  paid: "Pagada",
  cancelled: "Cancelada",
};

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

  const [range, setRange] = useState(() => normalizeRange(initialFrom, initialTo));
  const { from, to } = range;
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [, startTransition] = useTransition();

  const [staffProduction, setStaffProduction] = useState<StaffProduction[]>(initialStaffProduction);
  const [liquidationResults, setLiquidationResults] = useState<StaffLiquidationPreview[]>([]);
  const [liquidations, setLiquidations] = useState<StaffLiquidationListItem[]>(initialStaffLiquidations);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [cashMovementType, setCashMovementType] = useState("income");

  const [cashSession, setCashSession] = useState<CashSessionSummary | null>(initialCashSession);
  const [cashMovements, setCashMovements] = useState<CashMovementItem[]>(initialCashMovements);
  const [cashSessionsHistory, setCashSessionsHistory] = useState<CashSessionSummary[]>(initialCashSessionsHistory);
  const [cashLoading, setCashLoading] = useState(false);

  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const shopRef = useRef(shopId);
  const isFirstRender = useRef(true);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    shopRef.current = shopId;
  }, [shopId]);

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

  const triggerLoads = useCallback(async (nextFrom: string, nextTo: string) => {
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
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    triggerLoads(from, to);
  }, [from, to, triggerLoads]);

  // Sin canal de realtime a proposito. Las tablas que mira esta pagina
  // (`cash_movements`, `cash_sessions`, `staff_liquidations`, `finances`) las
  // escribe solo `finances-actions.ts`, que a su vez se llama solo desde aca, y
  // cada handler de mutacion ya refresca con `triggerLoads` por su cuenta. O
  // sea que el canal re-traia lo que el usuario acababa de recargar, y ademas
  // refrescaba por una via distinta a la del render, con otros limites y con
  // los KPI de caja en cero. Si algun dia otro dispositivo o proceso escribe
  // esas tablas, el canal vuelve a hacer falta.

  function setQuickFeedback(msg: string) {
    setUiMessage(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      feedbackTimerRef.current = null;
      setUiMessage(null);
    }, 1600);
  }

  function applyRange(nextFrom: string, nextTo: string) {
    setRange(normalizeRange(nextFrom, nextTo));
  }

  function toggleStaffSelection(staffId: string) {
    setSelectedStaff((prev) => (prev.includes(staffId) ? prev.filter((x) => x !== staffId) : [...prev, staffId]));
  }

  async function handleCreatePreLiquidations(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedStaff.length === 0) return;
    setBusyKey("liq-create");
    setError(null);

    // La action liquida de a una persona por vez, asi que se llama una por cada
    // chequeado. Va en serie y no en paralelo: cada llamada pega un insert en
    // `staff_liquidations` y varias en paralelo sobre el mismo local y periodo
    // abren la puerta a liquidaciones cruzadas.
    const targets = [...selectedStaff];
    const ok: StaffLiquidationPreview[] = [];
    for (const staffUserId of targets) {
      const fd = new FormData();
      fd.set("staff_user_id", staffUserId);
      fd.set("period_start", from);
      fd.set("period_end", to);
      const res = await createStaffPreLiquidation(fd, shopId || undefined);
      if (res.success && res.data) ok.push(res.data);
      else setError(actionError(res, "No se pudo generar"));
    }

    setBusyKey(null);
    setLiquidationResults(ok);
    setSelectedStaff([]);
    setQuickFeedback(
      ok.length === 1 ? "Pre-liquidacion creada" : ok.length > 1 ? `${ok.length} liquidaciones creadas` : "No se creo ninguna"
    );
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
  const kpiDiff = cashSession?.differenceAmount ?? 0;
  // El empleado solo ve su fila. El filtro va en el cliente porque el server ya
  // devuelve todas las filas con los importes en cero para staff
  // `fetchStaffProduction` incluye owner y admin, pero a un dueño no se lo liquida:
// al listarlos offering check para marcarlo, "Calcular" le daba $0 y no se
// entendia por que. Para el empleado, solo su fila; el server ya devuelve todas
// con los importes en cero para staff, asi que no hay dato ajeno que ver.
const liquidables = staffProduction.filter((s) => s.role === "staff");
const staffRows = isOwnerOrAdmin ? liquidables : liquidables.filter((s) => s.staffId === userId);

  return (
    <div className="space-y-5">
      {isOwnerOrAdmin && (
        <>
      <header className="flex flex-wrap items-center gap-3">
        <PageTitle className="text-3xl sm:text-5xl text-gray-900 dark:text-white leading-none">Finanzas</PageTitle>
        {uiMessage && <span className="ui-badge">{uiMessage}</span>}
        {error && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300">{error}</span>}
      </header>

      <div className="ui-card inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
        <button onClick={() => applyRange(today, today)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">DIA</button>
        <button onClick={() => applyRange(weekBounds.from, weekBounds.to)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">SEMANA</button>
        <button onClick={() => applyRange(monthBounds.from, monthBounds.to)} className="ui-btn-ghost rounded-lg px-2.5 py-1.5 text-xs">MES</button>
        <input type="date" value={from} onChange={(e) => applyRange(e.target.value, to)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
        <input type="date" value={to} onChange={(e) => applyRange(from, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
      </div>

      <div className="ui-card rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-zinc-400">Ingresos</p>
            <p className="mt-1 text-sm sm:text-lg font-bold text-emerald-600 tabular-nums tracking-tight">${(data?.totalIncome ?? 0).toFixed(2)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-zinc-400">Gastos</p>
            <p className="mt-1 text-sm sm:text-lg font-bold text-red-500 tabular-nums tracking-tight">${(data?.totalExpenses ?? 0).toFixed(2)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-zinc-400">Balance</p>
            <p className={`mt-1 text-sm sm:text-lg font-bold tabular-nums tracking-tight ${(data?.netBalance ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>${(data?.netBalance ?? 0).toFixed(2)}</p>
          </div>
        </div>
      </div>
        </>
      )}

      {/* En desktop las dos cards van en columnas: a lo ancho de la pantalla
          quedaban estiradas y la de Caja, con el numero centrado y los forms
          de ancho completo, se veía muy vacía. `items-start` para que la más
          corta no se estire hasta la altura de la otra. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card title={isOwnerOrAdmin ? "Equipo" : "Mi Produccion"}>
        {isOwnerOrAdmin && staffProduction.length === 0 && (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <Users2 className="h-7 w-7 text-slate-400" />
            <button onClick={() => { setBusyKey("load-team"); triggerLoads(from, to).finally(() => setBusyKey(null)); }} className="ui-btn-primary rounded-lg px-4 py-2 text-sm">{busyKey === "load-team" ? "Cargando..." : "+ Cargar equipo"}</button>
          </div>
        )}

        {/* El desplegable "Liquidar empleado" se sustituyo por un check por fila:
            se puede liquidar varias personas en una sola tanda. */}
        {isOwnerOrAdmin && liquidables.length > 0 && (
          <form onSubmit={handleCreatePreLiquidations} className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {selectedStaff.length === 0
                ? "Tocá a quien quieras liquidar."
                : selectedStaff.length === 1
                  ? "1 empleado marcado"
                  : `${selectedStaff.length} empleados marcados`}
            </p>
            <button
              type="submit"
              disabled={busyKey === "liq-create" || selectedStaff.length === 0}
              className="ui-btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-40"
            >
              {busyKey === "liq-create"
                ? `Calculando ${selectedStaff.length}...`
                : selectedStaff.length > 1
                  ? `Calcular ${selectedStaff.length}`
                  : "Calcular"}
            </button>
          </form>
        )}

        {staffRows.length > 0 && (
          <div className={`overflow-x-auto ${isOwnerOrAdmin ? "mb-4" : ""}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-zinc-400">
                  {isOwnerOrAdmin && (
                    <th className="w-8 py-2">
                      <span className="sr-only">Liquidar</span>
                    </th>
                  )}
                  <th className="py-2 font-medium">Empleado</th>
                  <th className="font-medium">Turnos</th>
                  <th className="font-medium">Cobrado</th>
                  <th className="font-medium">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((s) => {
                  const marcado = selectedStaff.includes(s.staffId);
                  return (
                    <tr
                      key={s.staffId}
                      // La fila entera es la zona clicable: marcar no obliga a
                      // apuntar al check de 20px.
                      onClick={isOwnerOrAdmin ? () => toggleStaffSelection(s.staffId) : undefined}
                      className={`border-t transition-colors ${isOwnerOrAdmin ? "cursor-pointer" : ""} ${
                        marcado ? "border-[#0071E3]/25 bg-[#0071E3]/[0.06] dark:border-[#5da8ff]/25 dark:bg-[#5da8ff]/[0.08]" : "border-slate-100 hover:bg-slate-50/70 dark:border-zinc-800 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      {isOwnerOrAdmin && (
                        <td className="py-2 pr-1">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggleStaffSelection(s.staffId)}
                            // Sin esto el click del check marca dos veces (una por
                            // el input y otra por la fila) y termina sin hacer nada.
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Liquidar a ${s.staffName}`}
                            className="peer sr-only"
                          />
                          <span
                            data-checked={marcado || undefined}
                            className="group pointer-events-none grid h-5 w-5 place-items-center rounded-md border-2 border-zinc-300 bg-white transition-all duration-150 ease-out data-[checked]:border-[#0071E3] data-[checked]:bg-[#0071E3] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0071E3]/40 peer-focus-visible:ring-offset-2 dark:border-zinc-600 dark:bg-zinc-900 dark:data-[checked]:border-[#5da8ff] dark:data-[checked]:bg-[#5da8ff]"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5 scale-0 stroke-white stroke-[3] transition-transform duration-150 ease-out group-data-[checked]:scale-100"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </span>
                        </td>
                      )}
                      <td className="py-2 font-medium text-slate-900 dark:text-white">{s.staffName}</td>
                      <td className="text-slate-700 dark:text-zinc-300">{s.appointmentsCount}</td>
                      <td className="text-emerald-600 font-semibold">${s.paidRevenue.toFixed(2)}</td>
                      <td className="text-slate-700 dark:text-zinc-300">${s.avgTicketPaid.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Lo que se acaba de calcular va DEBAJO de la tabla, cerca de las
            personas a las que corresponde. */}
        {isOwnerOrAdmin && liquidationResults.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 border-b border-emerald-200/70 px-4 py-2.5 dark:border-emerald-900/50">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                {liquidationResults.length === 1 ? "Liquidación creada" : `${liquidationResults.length} liquidaciones creadas`}
              </span>
            </div>
            <ul className="divide-y divide-emerald-200/60 dark:divide-emerald-900/40">
              {liquidationResults.map((r) => {
                // Bruto > 0 pero Final 0 significa que la regla de compensación
                // del empleado está en 0%. Sin esto el $0 parece un error de la app.
                const enCero = r.grossRevenue > 0 && Number(r.finalPayable) === 0;
                return (
                  <li key={r.staffId} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-emerald-900 dark:text-emerald-100">{r.staffName}</span>
                      <span className="text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                        ${r.finalPayable.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-300/70">
                      Bruto ${r.grossRevenue.toFixed(2)} · comisión ${r.commissionAmount.toFixed(2)} ·{" "}
                      {r.itemsCount} turno{r.itemsCount === 1 ? "" : "s"}
                    </p>
                    {enCero && (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Dio $0 porque la regla de compensación de este empleado está en 0%.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {liquidationResults.length > 1 && (
              <div className="flex items-baseline justify-between gap-3 border-t border-emerald-200/70 bg-emerald-100/60 px-4 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-900/25">
                <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Total</span>
                <span className="text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                  ${liquidationResults.reduce((s, r) => s + Number(r.finalPayable), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Historial de liquidaciones */}
        {isOwnerOrAdmin && liquidations.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">Liquidaciones anteriores</p>
            <div className="space-y-1">
              {liquidations.map((l) => {
                const pagado = l.status === "paid";
                return (
                  <div key={l.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3.5 py-2.5 text-sm dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-700 dark:text-zinc-300">{l.staffName}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          pagado
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}
                      >
                        {LIQUIDATION_STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-emerald-600">${l.finalPayable.toFixed(2)}</span>
                      {!pagado && (
                        <button
                          onClick={() => void handleMarkLiquidationPaid(l)}
                          disabled={busyKey === `liq-paid-${l.id}`}
                          className="ui-btn-primary rounded-lg px-2.5 py-1 text-xs"
                        >
                          {busyKey === `liq-paid-${l.id}` ? "..." : "Pagar"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {isOwnerOrAdmin && (
      <Card title="Caja">
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
            <span className="text-[11px] text-slate-400 dark:text-zinc-400">
              {new Date(cashSession.openedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {cashLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
        ) : (
          <div>
            <div className="mb-5 text-center">
              {/* Monto a la izquierda de la palabra y el bloque centrado: asi el
                  numero, que es lo que se mira, queda a la vista primero. */}
              <p className="inline-flex flex-wrap items-baseline justify-center gap-x-2">
                <span className="text-3xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">${kpiExpected.toFixed(2)}</span>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">esperado</span>
              </p>
              {cashSession?.status === "open" && (
                <div className="mt-1.5 flex justify-center gap-3 text-[11px] text-slate-400 dark:text-zinc-400">
                  <span>Inicial: <strong className="text-slate-600 dark:text-zinc-300">${cashSession.openingAmount.toFixed(2)}</strong></span>
                  <span>Mov: <strong className="text-slate-600 dark:text-zinc-300">${cashSession.movementNet >= 0 ? "+" : ""}${cashSession.movementNet.toFixed(2)}</strong></span>
                  <span>Turnos: <strong className="text-slate-600 dark:text-zinc-300">+${cashSession.appointmentIncome.toFixed(2)}</strong></span>
                </div>
              )}
            </div>

            {cashSession?.status === "open" ? (
              <form onSubmit={handleCloseCashSession} className="flex gap-2">
                <input name="counted_amount" type="number" step="0.01" min="0" required placeholder="Efectivo contado al cierre" className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
                <button disabled={busyKey === "cash-close"} className="ui-btn-primary rounded-lg px-5 py-2.5 text-sm min-h-[42px]">{busyKey === "cash-close" ? "Cerrando..." : "Cerrar caja"}</button>
              </form>
            ) : (
              <form onSubmit={handleOpenCashSession} className="flex gap-2">
                <input name="opening_amount" type="number" step="0.01" min="0" required placeholder="Efectivo inicial" className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
                <button disabled={busyKey === "cash-open"} className="ui-btn-primary rounded-lg px-5 py-2.5 text-sm min-h-[42px]">{busyKey === "cash-open" ? "Abriendo..." : "Abrir caja"}</button>
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
              <input name="category" required placeholder="Categoria" className="min-w-[100px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Monto" className="min-w-[80px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <button disabled={busyKey === "cash-move-create"} className="ui-btn-primary rounded-lg px-3 py-2 text-sm min-h-[38px]">{busyKey === "cash-move-create" ? "..." : "Agregar"}</button>
            </form>

            {/* `!= null` y no `> 0`: una caja cerrada con $0 contado tiene diferencia igual,
                y con el `> 0` no se mostraba justo cuando mas importa. */}
            {cashSession?.countedAmount != null && (
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

            {/* Las dos listas van en columnas desde `sm`: apiladas hacian que la card de
                Caja fuera ~300px mas alta que la de Equipo y quedaba un hueco
                enorme al lado. En mobile siguen apiladas con el mismo gap. */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Los movimientos viven en el modal. La lista inline mostraba 5 de
                hasta 50 y repetia la lista que ya estas por abrir. */}
            {cashMovements.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setMovementsOpen(true)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm transition-colors hover:border-[#0071E3]/40 hover:bg-[#0071E3]/[0.04] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-[#5da8ff]/40 dark:hover:bg-[#5da8ff]/[0.06]"
                >
                  <span className="text-left">
                    <span className="block font-semibold text-slate-700 dark:text-zinc-300">Movimientos</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">Ver todos los del periodo</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5">
                    <span className="tabular-nums text-slate-500 dark:text-zinc-400">{cashMovements.length}</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" strokeWidth={2} />
                  </span>
                </button>
              </div>
            )}

            {/* Cierres recientes */}
            {cashSessionsHistory.filter((s) => s.status === "closed").length > 0 && (
              <div>
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
          </div>
        )}
      </Card>
      )}
      </div>

      <BaseModal
        open={movementsOpen}
        onClose={() => setMovementsOpen(false)}
        title="Movimientos de caja"
        subtitle={`${cashMovements.length} movimiento${cashMovements.length === 1 ? "" : "s"} en el periodo`}
        maxWidth="md"
        icon={<ArrowLeftRight className="h-5 w-5 text-[#0071E3]" />}
      >
        <div className="max-h-[60vh] overflow-y-auto px-5 pb-5">
          {cashMovements.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-400">No hay movimientos en este periodo.</p>
          ) : (
            <ul className="space-y-1.5">
              {cashMovements.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-zinc-100">{m.category || "General"}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                        {m.movementType === "income" ? "Ingreso" : m.movementType === "withdrawal" ? "Retiro" : "Gasto"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-zinc-400">
                      {m.description || "Sin detalle"} ·{" "}
                      {new Date(m.happenedAt).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-base font-semibold tabular-nums ${
                      m.movementType === "income" ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {m.movementType === "income" ? "+" : "-"}${m.amount.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BaseModal>

    </div>
  );
}
