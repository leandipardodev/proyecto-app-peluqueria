"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Users2, ArrowLeftRight, CalendarDays, ChevronRight, History, X } from "lucide-react";
import {
  fetchFinanceData,
  fetchStaffProduction,
  createStaffPreLiquidation,
  fetchStaffLiquidations,
  fetchStaffLiquidationsHistory,
  fetchStaffLiquidationItems,
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
  type StaffLiquidationHistoryItem,
  type StaffLiquidationDetailItem,
  type CashSessionSummary,
  type CashMovementItem,
} from "@/lib/dashboard/finances/finances-actions";
import { normalizeRange } from "@/lib/dashboard/finances/date-range";
import { cn } from "@/lib/utils";
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
  incomeTruncated: boolean;
  movementsTruncated: boolean;
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

/** `2026-10-03` a las 12 ART, para que `toLocaleDateString` no corra el dia. */
function artDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00-03:00`);
}

/** "3 oct" / "1 oct – 31 oct". */
function formatRangeLabel(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (from === to) return artDate(from).toLocaleDateString("es-AR", opts);
  return `${artDate(from).toLocaleDateString("es-AR", opts)} – ${artDate(to).toLocaleDateString("es-AR", opts)}`;
}

/**
 * Lo unico que se ve del filtro mientras esta plegado, asi que tiene que decir
 * el periodo y no "Filtrar": si no parece un buscador de texto y no se entiende
 * que esta cambiando. Para un rango a mano no hay nombre, solo las fechas.
 */
function describePeriod(
  from: string,
  to: string,
  today: string,
  weekBounds: { from: string; to: string },
  monthBounds: { from: string; to: string },
): { title: string; range: string } {
  const range = formatRangeLabel(from, to);
  if (from === today && to === today) return { title: "Hoy", range };
  if (from === weekBounds.from && to === weekBounds.to) return { title: "Esta semana", range };
  if (from === monthBounds.from && to === monthBounds.to) {
    const month = artDate(from).toLocaleDateString("es-AR", { month: "long" });
    return { title: month.charAt(0).toUpperCase() + month.slice(1), range };
  }
  return { title: "", range };
}

const INPUT_DATE_CLASS =
  "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-[#0071E3]/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const FILTER_SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } as const;

/**
 * El filtro de fechas vive plegado en un chip y se despliega solo: en desktop
 * alcanza con acercar el puntero (la zona de proximidad son los 20px de aire
 * del wrapper), en mobile se abre al tocarlo. Plegado ocupa 130px en vez de
 * una fila entera de controles que solo se usan de vez en cuando.
 */
function DateFilterBar({
  from,
  to,
  today,
  weekBounds,
  monthBounds,
  onApply,
}: {
  from: string;
  to: string;
  today: string;
  weekBounds: { from: string; to: string };
  monthBounds: { from: string; to: string };
  onApply: (nextFrom: string, nextTo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const presets = [
    { label: "Día", from: today, to: today },
    { label: "Semana", from: weekBounds.from, to: weekBounds.to },
    { label: "Mes", from: monthBounds.from, to: monthBounds.to },
  ];
  const period = describePeriod(from, to, today, weekBounds, monthBounds);

  return (
    <div
      ref={wrapRef}
      // La zona de proximidad es un pseudo-elemento de 20px alrededor del chip,
      // no padding con margen negativo: en flujo de bloque los margenes negativos
      // se colapsan con los del `space-y` del contenedor y el filtro quedaba
      // pegado a la tarjeta de arriba. Encima no hay nada con que chocar: el
      // header y los KPI son texto.
      className="relative before:absolute before:-inset-5 before:content-['']"
      // `pointerType` separa los dos gestos: con el mouse se abre por
      // proximidad y se cierra al alejarse, con el dedo y al tocar el chip.
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false);
      }}
    >
      <motion.div
        layout
        transition={FILTER_SPRING}
        // `relative` para el `popLayout` de AnimatePresence: el chip que sale
        // se posiciona absoluto durante los 150ms de la transicion y sin esto se
        // va a la esquina de la pantalla.
        className="ui-card relative w-fit rounded-2xl border border-slate-200/80 bg-white p-1.5 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {open ? (
            <motion.div
              key="panel"
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.15 }}
              className="flex flex-wrap items-center gap-1.5"
            >
              {/* En el estado abierto tambien hay que decir que se esta
                  eligiendo un periodo, no filtrando una lista de nombres. */}
              <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
                Período
              </span>
              {presets.map((p) => {
                const active = p.from === from && p.to === to;
                return (
                  <button
                    key={p.label}
                    onClick={() => onApply(p.from, p.to)}
                    // Sin `ui-btn-ghost` a proposito: en globals.css esas clases
                    // estan fuera de `@layer`, asi que le ganan a cualquier
                    // utilidad de Tailwind y el color activo no aplicaria.
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-[#0071E3] text-white dark:bg-[#5da8ff]"
                        : "border border-slate-200/80 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <span aria-hidden className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-zinc-700" />
              <input
                type="date"
                value={from}
                aria-label="Desde"
                onChange={(e) => onApply(e.target.value, to)}
                className={INPUT_DATE_CLASS}
              />
              <input
                type="date"
                value={to}
                aria-label="Hasta"
                onChange={(e) => onApply(from, e.target.value)}
                className={INPUT_DATE_CLASS}
              />
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar filtro"
                className="ui-btn-ghost grid h-7 w-7 place-items-center rounded-lg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="chip"
              layout
              type="button"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(true)}
              title="Período de toda la página: KPIs, equipo y movimientos"
              className="ui-btn-ghost flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
            >
              <CalendarDays className="h-3.5 w-3.5 text-[#0071E3] dark:text-[#5da8ff]" />
              {period.title && <span className="font-semibold">{period.title}</span>}
              <span className="text-slate-400 dark:text-zinc-400">{period.range}</span>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

const MOVEMENT_TYPES = [
  { value: "income", label: "Ingreso", pill: "bg-emerald-500" },
  { value: "expense", label: "Gasto", pill: "bg-red-500" },
  { value: "withdrawal", label: "Retiro", pill: "bg-amber-500" },
] as const;

/**
 * Ingreso / Gasto / Retiro en tres posiciones y un solo toque: cada toque pasa
 * a la siguiente. Antes era un `CustomSelect`, que para elegir entre tres cosas
 * era un menu desplegable de dos toques guardingado el ancho de una fila.
 */
function MovementTypeSwitch({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const activeIndex = Math.max(
    0,
    MOVEMENT_TYPES.findIndex((t) => t.value === value),
  );

  return (
    <button
      type="button"
      onClick={() => onChange(MOVEMENT_TYPES[(activeIndex + 1) % MOVEMENT_TYPES.length].value)}
      title="Tocá para cambiar el tipo"
      aria-label={`Tipo de movimiento: ${MOVEMENT_TYPES[activeIndex].label}. Tocá para cambiar.`}
      className="flex min-w-0 flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/70"
    >
      {MOVEMENT_TYPES.map((t, i) => (
        <span
          key={t.value}
          className={`relative min-w-0 flex-1 rounded-[7px] px-1 py-1.5 text-center text-[11px] font-semibold transition-colors ${
            i === activeIndex ? "text-white" : "text-slate-500 dark:text-zinc-400"
          }`}
        >
          {i === activeIndex && (
            <motion.span
              layoutId="movement-type-pill"
              className={`absolute inset-0 rounded-[7px] shadow-[0_4px_10px_-6px_rgba(15,23,42,0.6)] ${t.pill}`}
              transition={FILTER_SPRING}
            />
          )}
          <span className="relative block truncate">{t.label}</span>
        </span>
      ))}
    </button>
  );
}

/**
 * Boton que se "enciende" solo cuando el formulario esta completo. Apagado no es
 * un `disabled` con opacidad: es un boton sin acento, porque un boton apagado
 * tiene que leerse como algo todavia no disponible, no como algo que fallo.
 */
function GlowButton({
  on,
  disabled,
  className = "",
  children,
}: {
  on: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const lit = on && !disabled;
  return (
    <button
      type="submit"
      disabled={disabled || !on}
      // `cn` y no concatenacion: el padding de base tiene que perder contra el
      // que pasa cada llamada.
      className={cn(
        "rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
        lit
          ? "ui-btn-primary shadow-[0_8px_20px_-10px_rgba(0,113,227,0.95)] dark:shadow-[0_8px_20px_-10px_rgba(93,168,255,0.9)]"
          : "border border-slate-200 bg-slate-100 text-slate-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Card({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    // `h-full flex flex-col`: las dos cards comparten la fila del grid, asi que
    // sin esto la mas corta deja un hueco al lado de la otra.
    <section className="ui-card flex h-full flex-col rounded-3xl border border-slate-200/80 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
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

/**
 * El CHECK de `staff_liquidations` permite `('draft','confirmed','paid','cancelled')`.
 * El mapa tenia `pending`, que no existe, y le faltaba `confirmed`: una
 * liquidacion confirmada caia en el `?? status` y mostraba la palabra cruda.
 */
const LIQUIDATION_STATUS_LABEL: Record<string, string> = {
  draft: "Pendiente",
  confirmed: "Pendiente",
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
  initialStaffProductionTruncated = false,
  initialCashSession = null,
  initialCashMovements = [],
  initialCashMovementsTotal = 0,
  initialCashMovementsTruncated = false,
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
  initialStaffProductionTruncated: boolean;
  initialCashSession: CashSessionSummary | null;
  initialCashMovements: CashMovementItem[];
  initialCashMovementsTotal: number;
  initialCashMovementsTruncated: boolean;
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
  const [staffTruncated, setStaffTruncated] = useState(initialStaffProductionTruncated);
  const [liquidationResults, setLiquidationResults] = useState<StaffLiquidationPreview[]>([]);
  const [liquidations, setLiquidations] = useState<StaffLiquidationListItem[]>(initialStaffLiquidations);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<StaffLiquidationHistoryItem[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyDetailId, setHistoryDetailId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<Record<string, StaffLiquidationDetailItem[]>>({});
  const [historyDetailBusy, setHistoryDetailBusy] = useState<string | null>(null);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [cashMovementType, setCashMovementType] = useState("income");
  const [moveCategory, setMoveCategory] = useState("");
  const [moveAmount, setMoveAmount] = useState("");
  const [countedAmount, setCountedAmount] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");

  const [cashSession, setCashSession] = useState<CashSessionSummary | null>(initialCashSession);
  const [cashMovements, setCashMovements] = useState<CashMovementItem[]>(initialCashMovements);
  // El total real del periodo, que puede ser mas que `cashMovements.length`: el
  // listado esta recortado y el contador de la UI tiene que decir cuantos hay.
  const [cashMovementsTotal, setCashMovementsTotal] = useState(initialCashMovementsTotal || initialCashMovements.length);
  const [cashMovementsTruncated, setCashMovementsTruncated] = useState(initialCashMovementsTruncated);
  const [cashSessionsHistory, setCashSessionsHistory] = useState<CashSessionSummary[]>(initialCashSessionsHistory);
  const [cashLoading, setCashLoading] = useState(false);

  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const shopRef = useRef(shopId);
  const isFirstRender = useRef(true);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Numero de secuencia de la ultima carga pedida. Sin esto, cambiar el periodo
  // dos veces rapido puede dejar en pantalla la data del periodo viejo: la
  // segunda consulta puede responder antes que la primera y la primera, que
  // llega ultimo, pisa todo. Cada carga toma un numero y antes de escribir
  // comprueba que siga siendo la ultima.
  const loadSeqRef = useRef(0);

  useEffect(() => {
    shopRef.current = shopId;
  }, [shopId]);

  async function refreshCashData(nextFrom: string, nextTo: string, seq: number) {
    const sid = shopRef.current || undefined;
    setCashLoading(true);
    try {
      const [session, moves, history] = await Promise.all([
        fetchCashSession(sid),
        fetchCashMovements(nextFrom, nextTo, sid),
        fetchCashSessionsHistory(nextFrom, nextTo, sid),
      ]);
      if (seq !== loadSeqRef.current) return;
      if (session.success) setCashSession(session.data ?? null);
      if (moves.success && moves.data) {
        setCashMovements(moves.data.rows);
        setCashMovementsTotal(moves.data.totalCount);
        setCashMovementsTruncated(moves.data.truncated);
      }
      if (history.success && history.data) setCashSessionsHistory(history.data);
    } catch {
      /* ignore */
    } finally {
      if (seq === loadSeqRef.current) setCashLoading(false);
    }
  }

  const triggerLoads = useCallback(async (nextFrom: string, nextTo: string) => {
    const sid = shopRef.current || undefined;
    const seq = ++loadSeqRef.current;
    const vigente = () => seq === loadSeqRef.current;

    startTransition(async () => {
      const result = await fetchFinanceData(nextFrom, nextTo, sid);
      if (!vigente()) return;
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
        if (!vigente()) return;
        if (prod.success && prod.data) {
          setStaffProduction(prod.data.rows);
          setStaffTruncated(prod.data.truncated);
        } else {
          setStaffProduction([]);
          setStaffTruncated(false);
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
        if (!vigente()) return;
        setStaffProduction([]);
        setStaffTruncated(false);
        setLiquidations([]);
      }
    })();

    const cashPromise = refreshCashData(nextFrom, nextTo, seq);

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
    // chequeado. Va en serie y no en paralelo: cada llamada lee y escribe
    // `staff_liquidations` del mismo local y periodo, y en paralelo se pisan
    // entre ellas.
    const targets = [...selectedStaff];
    const ok: StaffLiquidationPreview[] = [];
    const yaPagas: string[] = [];
    for (const staffUserId of targets) {
      const fd = new FormData();
      fd.set("staff_user_id", staffUserId);
      fd.set("period_start", from);
      fd.set("period_end", to);
      const res = await createStaffPreLiquidation(fd, shopId || undefined);
      if (res.success && res.data) {
        // La action no pisa una liquidacion ya pagada: avisa en vez de tocar.
        if (res.data.alreadyPaid) yaPagas.push(res.data.staffName);
        else ok.push(res.data);
      } else setError(actionError(res, "No se pudo generar"));
    }

    setBusyKey(null);
    setLiquidationResults(ok);
    setSelectedStaff([]);
    setQuickFeedback(
      ok.length === 0
        ? yaPagas.length > 0
          ? "Ya estaba pagada"
          : "No se creo ninguna"
        : ok.length === 1
          ? "Liquidación lista para pagar"
          : `${ok.length} liquidaciones listas para pagar`
    );
    if (yaPagas.length > 0) {
      setError(`${yaPagas.join(", ")} ya estaba pagada en este período, no se volvió a calcular.`);
    }
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

  async function handleOpenHistory() {
    setHistoryOpen(true);
    setHistoryBusy(true);
    const res = await fetchStaffLiquidationsHistory(shopId || undefined);
    setHistoryBusy(false);
    if (res.success && res.data) setHistory(res.data);
    else setError(actionError(res, "No se pudo cargar el historial"));
  }

  async function toggleHistoryDetail(liquidationId: string) {
    if (historyDetailId === liquidationId) return setHistoryDetailId(null);
    setHistoryDetailId(liquidationId);
    // El detalle ya cargado no se vuelve a pedir: abrir y cerrar el acordeon
    // es gratis la segunda vez.
    if (historyDetail[liquidationId]) return;
    setHistoryDetailBusy(liquidationId);
    const res = await fetchStaffLiquidationItems(liquidationId, shopId || undefined);
    setHistoryDetailBusy(null);
    const items = res.success && res.data ? res.data : [];
    setHistoryDetail((prev) => ({ ...prev, [liquidationId]: items }));
  }

  async function handleOpenCashSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusyKey("cash-open");
    const res = await openCashSession(new FormData(e.currentTarget), shopId || undefined);
    setBusyKey(null);
    if (!res.success) return setError(actionError(res, "No se pudo abrir caja"));
    setOpeningAmount("");
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
    setCountedAmount("");
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
    setMoveCategory("");
    setMoveAmount("");
    setQuickFeedback("Movimiento guardado");
    void triggerLoads(from, to);
  }

  // Los botones se encienden solos: no hace falta que el server los valide para
  // saber si el formulario esta completo.
  const moveAmountValue = Number(moveAmount);
  const canAddMovement = moveCategory.trim().length > 0 && Number.isFinite(moveAmountValue) && moveAmountValue > 0;
  const countedValue = Number(countedAmount);
  const canCloseCash = countedAmount.trim().length > 0 && Number.isFinite(countedValue) && countedValue >= 0;
  const openingValue = Number(openingAmount);
  const canOpenCash = openingAmount.trim().length > 0 && Number.isFinite(openingValue) && openingValue >= 0;

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

  // Una liquidacion por profesional y periodo: es lo que garantiza
  // `idx_staff_liquidations_unique_period`. Si el rango abarca mas de una
  // liquidacion del mismo profesional (una por semana, pongamos), gana la que
  // sigue pendiente; si esta todo pagado, la mas reciente, que es el orden en
  // que llega `fetchStaffLiquidations`.
  const liqByStaff = new Map<string, StaffLiquidationListItem>();
  for (const l of liquidations) {
    const prev = liqByStaff.get(l.staffId);
    if (!prev || (prev.status === "paid" && l.status !== "paid")) liqByStaff.set(l.staffId, l);
  }
  const pendingLiquidations = [...liqByStaff.values()].filter(
    (l) => l.status !== "paid" && l.status !== "cancelled",
  );
  const pendingTotal = pendingLiquidations.reduce((s, l) => s + l.finalPayable, 0);
  // Cuantos periodos distintos cubren las liquidaciones pendientes. Si es mas de
  // uno, el "Total a pagar" no es el total del rango que esta filtrado.
  const periodosDistintos = new Set(
    pendingLiquidations.map((l) => `${l.periodStart}..${l.periodEnd}`),
  ).size;
  // El detalle de lo recien calculado vive en la fila, no en un panel aparte.
  const previewByStaff = new Map(liquidationResults.map((r) => [r.staffId, r]));

  return (
    <div className="space-y-5">
      {isOwnerOrAdmin && (
        <>
      <header className="flex flex-wrap items-center gap-3">
        <PageTitle className="text-3xl sm:text-5xl text-gray-900 dark:text-white leading-none">Finanzas</PageTitle>
        {uiMessage && <span className="ui-badge">{uiMessage}</span>}
        {error && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300">{error}</span>}
      </header>

      <DateFilterBar
        from={from}
        to={to}
        today={today}
        weekBounds={weekBounds}
        monthBounds={monthBounds}
        onApply={applyRange}
      />

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
        {/* El server corta las consultas para que no revienten con un rango
            gigante. Cuando corta, el total es mas bajo que el real y sin este
            aviso parece el numero definitivo. */}
        {(data?.incomeTruncated || data?.movementsTruncated) && (
          <p className="mt-2 rounded-lg bg-amber-100/70 px-3 py-2 text-[11px] leading-snug text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Este período tiene demasiados movimientos para mostrarlos todos: los totales de arriba son
            parciales. Achicá el rango para ver los números completos.
          </p>
        )}
      </div>
        </>
      )}

      {/* Las dos cards comparten la fila y se estiran a la misma altura: el grid
          sin `items-start` hace el trabajo, cada Card con `h-full` se lo aplica. */}
      <div className="grid gap-5 lg:grid-cols-2">
      <Card
        title={isOwnerOrAdmin ? "Equipo" : "Mi Produccion"}
        right={
          isOwnerOrAdmin && (
            <button
              onClick={() => void handleOpenHistory()}
              className="ui-btn-ghost flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
            >
              <History className="h-3.5 w-3.5" />
              Historial
            </button>
          )
        }
      >
        {isOwnerOrAdmin && staffProduction.length === 0 && (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <Users2 className="h-7 w-7 text-slate-400" />
            <button onClick={() => { setBusyKey("load-team"); triggerLoads(from, to).finally(() => setBusyKey(null)); }} className="ui-btn-primary rounded-lg px-4 py-2 text-sm">{busyKey === "load-team" ? "Cargando..." : "+ Cargar equipo"}</button>
          </div>
        )}

        {/* El desplegable "Liquidar empleado" se sustituyo por un check por fila:
            se puede liquidar varias personas en una sola tanda. */}
        {isOwnerOrAdmin && liquidables.length > 0 && (
          <form onSubmit={handleCreatePreLiquidations} className="mb-3 flex min-h-[38px] items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {selectedStaff.length === 0
                ? "Tocá a quien quieras liquidar."
                : selectedStaff.length === 1
                  ? "1 empleado marcado"
                  : `${selectedStaff.length} empleados marcados`}
            </p>
            {/* "Calcular" solo existe con alguien marcado: no hay nada que calcular
                hasta que el check aparece, asi que no se ensucia el header con un
                boton gris que no hace nada. */}
            <AnimatePresence>
              {selectedStaff.length > 0 && (
                <motion.div
                  key="calcular"
                  initial={{ opacity: 0, scale: 0.55, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.55, y: 8 }}
                  transition={{ type: "spring", stiffness: 380, damping: 24 }}
                  className="relative isolate rounded-xl"
                >
                  {/* Sin `overflow-hidden`: la mancha es mas grande que el boton
                      y si se recortara no se veria nada. */}
                  <span
                    aria-hidden
                    className="absolute -inset-3 -z-10 animate-[blob-morph_8s_ease-in-out_infinite] bg-[radial-gradient(closest-side,rgba(0,113,227,0.6),rgba(93,168,255,0.18)_62%,transparent)]"
                  />
                  <button
                    type="submit"
                    disabled={busyKey === "liq-create"}
                    className="ui-btn-primary relative rounded-xl px-4 py-2 text-sm shadow-[0_8px_22px_-10px_rgba(0,113,227,0.95)]"
                  >
                    {busyKey === "liq-create"
                      ? `Calculando ${selectedStaff.length}...`
                      : selectedStaff.length > 1
                        ? `Calcular ${selectedStaff.length}`
                        : "Calcular"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        )}

        {staffRows.length > 0 && (
          <div className="overflow-x-auto">
            {/* Un solo degradado para todos los checks de la tabla. */}
            <svg aria-hidden width="0" height="0" className="absolute">
              <defs>
                <linearGradient id="klip-check-grad" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#5da8ff" />
                  <stop offset="100%" stopColor="#0071E3" />
                </linearGradient>
              </defs>
            </svg>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-zinc-400">
                  {isOwnerOrAdmin && (
                    <th className="w-7 py-2">
                      <span className="sr-only">Liquidar</span>
                    </th>
                  )}
                  <th className="py-2 font-medium">Profesional</th>
                  <th className="font-medium">Turnos</th>
                  <th className="font-medium">Cobrado</th>
                  {/* Donde estaba Ticket: el estado del pago de esa persona. Sin
                      esta columna para el empleado, que no ve liquidaciones. */}
                  {isOwnerOrAdmin && <th className="py-2 pl-2 text-right font-medium">Pago</th>}
                </tr>
              </thead>
              <tbody>
                {staffRows.map((s) => {
                  const marcado = selectedStaff.includes(s.staffId);
                  const liq = liqByStaff.get(s.staffId);
                  const preview = previewByStaff.get(s.staffId);
                  // Bruto > 0 pero a pagar 0 significa que la regla de
                  // compensacion del profesional esta en 0%. Sin esto el $0
                  // parece un error de la app.
                  const enCero = preview ? preview.grossRevenue > 0 && Number(preview.finalPayable) === 0 : false;
                  const pagada = liq?.status === "paid";
                  // Si la liquidación cubre justo el rango filtrado, el período no
                  // hace falta: se entiende solo. Si lo cubre a medias o no, se
                  // avisa en ámbar, porque los números de al lado son de otro rango.
                  const cubreRango = Boolean(liq && liq.periodStart === from && liq.periodEnd === to);
                  return (
                    <tr
                      key={s.staffId}
                      // La fila entera es la zona clicable: marcar no obliga a
                      // apuntar al check de 18px.
                      onClick={isOwnerOrAdmin ? () => toggleStaffSelection(s.staffId) : undefined}
                      className={`border-t transition-colors ${isOwnerOrAdmin ? "cursor-pointer" : ""} ${
                        marcado ? "border-[#0071E3]/25 bg-[#0071E3]/[0.06] dark:border-[#5da8ff]/25 dark:bg-[#5da8ff]/[0.08]" : "border-slate-100 hover:bg-slate-50/70 dark:border-zinc-800 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      {isOwnerOrAdmin && (
                        /* El input real queda invisible y hace de foco de teclado;
                           el anillo va en la celda con `has-` porque el check
                           dibujado solo existe cuando la fila esta marcada. */
                        <td className="py-2 pr-1 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0071E3]/60">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggleStaffSelection(s.staffId)}
                            // Sin esto el click del check marca dos veces (una por
                            // el input y otra por la fila) y termina sin hacer nada.
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Liquidar a ${s.staffName}`}
                            className="sr-only"
                          />
                          {/* Sin cuadrado: solo el trazo del check, con una mancha
                              de color detras. Y si la fila no esta marcada no se
                              dibuja nada, la columna queda como una guia al nombre. */}
                          {marcado && (
                            <span
                              aria-hidden
                              className="pointer-events-none relative grid h-[18px] w-[18px] place-items-center animate-[liq-check-pop_340ms_cubic-bezier(.34,1.4,.64,1)_both]"
                            >
                              <span className="absolute inset-0 animate-[blob-morph_8s_ease-in-out_infinite] bg-[radial-gradient(closest-side,rgba(0,113,227,0.35),rgba(93,168,255,0.10)_70%,transparent)]" />
                              <svg viewBox="0 0 24 24" fill="none" className="relative h-[18px] w-[18px] overflow-visible drop-shadow-[0_2px_5px_rgba(0,113,227,0.5)]">
                                <path
                                  d="M4.8 12.6l4.4 4.4c.3.3.8.3 1.1 0l9-10.4"
                                  pathLength={1}
                                  stroke="url(#klip-check-grad)"
                                  strokeWidth={3.2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="animate-[liq-check-draw_420ms_cubic-bezier(.65,0,.35,1)_both]"
                                  style={{ strokeDasharray: 1 }}
                                />
                              </svg>
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-2 align-top">
                        <span className="font-medium text-slate-900 dark:text-white">{s.staffName}</span>
                        {/* Lo que se acaba de calcular se muestra en la fila, que
                            es donde ya estabas mirando: no hace falta un panel
                            verde aparte para leerlo. */}
                        {preview && (
                          <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-zinc-400">
                            Bruto ${preview.grossRevenue.toFixed(2)} · comisión ${preview.commissionAmount.toFixed(2)} ·{" "}
                            {preview.itemsCount} turno{preview.itemsCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {enCero && (
                          <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            Dio $0 porque la comisión de este profesional está en 0%.
                          </span>
                        )}
                      </td>
                      <td className="py-2 align-top text-slate-700 dark:text-zinc-300">{s.appointmentsCount}</td>
                      <td className="py-2 align-top font-semibold text-emerald-600">${s.paidRevenue.toFixed(2)}</td>
{isOwnerOrAdmin && (
                          <td className="py-2 pl-2 align-top text-right">
                            {/* Nada si todavia no hay liquidacion: la celda dice lo
                                que hay que hacer, no "—". */}
                            {liq ? (
                              <>
                                <span className="flex items-center justify-end gap-2">
                                  <span className="font-semibold tabular-nums text-emerald-600">
                                    ${liq.finalPayable.toFixed(2)}
                                  </span>
                                  {!pagada && (
                                    <button
                                      onClick={(e) => {
                                        // Sin esto el click del boton cae en la fila
                                        // y ademas de pagar desmarca a la persona.
                                        e.stopPropagation();
                                        void handleMarkLiquidationPaid(liq);
                                      }}
                                      disabled={busyKey === `liq-paid-${liq.id}`}
                                      className="ui-btn-primary rounded-lg px-2.5 py-1 text-xs"
                                    >
                                      {busyKey === `liq-paid-${liq.id}` ? "..." : "Pagar"}
                                    </button>
                                  )}
                                  {pagada && (
                                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Pagada</span>
                                  )}
                                </span>
                                {/* El período de la liquidación SIEMPRE debajo del
                                    monto. Turnos y Cobrado son del rango que está
                                    filtrando arriba, pero una liquidación suele
                                    ser semanal: sin esto, "$114.000 hoy" al lado
                                    de "$189.225 a pagar" se leen como del mismo
                                    período y no lo son. */}
                                <span
                                  className={`mt-0.5 block text-[11px] tabular-nums ${
                                    cubreRango
                                      ? "text-slate-400 dark:text-zinc-400"
                                      : "font-medium text-amber-600 dark:text-amber-400"
                                  }`}
                                >
                                  {formatRangeLabel(liq.periodStart, liq.periodEnd)}
                                </span>
                              </>
                            ) : null}
                          </td>
                        )}
                    </tr>
                  );
                })}
              </tbody>
              {isOwnerOrAdmin && pendingLiquidations.length > 1 && (
                <tfoot>
                  <tr className="border-t border-slate-200 dark:border-zinc-700">
                    <td className="py-2 pr-1" />
                    <td className="py-2 text-xs font-medium text-slate-500 dark:text-zinc-400" colSpan={3}>
                      Total a pagar
                      {/* El total suma liquidaciones, que pueden ser de períodos
                          distintos entre si. Decirlo evita que se lea como el
                          total de lo que se ve en Turnos y Cobrado de arriba. */}
                      {periodosDistintos > 0 && (
                        <span className="ml-1 font-normal text-slate-400 dark:text-zinc-400">
                          (de {periodosDistintos} liquidaciones distintas)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right text-sm font-bold tabular-nums text-emerald-600">
                      ${pendingTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Mismo criterio que en los KPIs: si el server corto la consulta de
            turnos, los "Cobrado" de la tabla son mas bajos que los reales. */}
        {staffTruncated && (
          <p className="mt-3 rounded-lg bg-amber-100/70 px-3 py-2 text-[11px] leading-snug text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Hay demasiados turnos en este período: los cobrados son parciales. Achicá el rango para ver los
            números completos.
          </p>
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
          <div className="flex flex-1 flex-col">
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

            {/* La parte baja de la card se parte a la mitad: a la izquierda el
                movimiento (tipo + agregar, categoria, monto) y a la derecha el
                cierre. Antes eran dos filas de ancho completo apiladas, que
                ocupaban el doble de alto para la misma informacion. */}
            <div className="mt-4 grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-5">
              <form onSubmit={handleCreateCashMovement} className="flex min-w-0 flex-col gap-2">
                <div className="flex items-stretch gap-2">
                  <MovementTypeSwitch value={cashMovementType} onChange={setCashMovementType} />
                  <input type="hidden" name="movement_type" value={cashMovementType} readOnly />
                  <GlowButton
                    on={canAddMovement}
                    disabled={busyKey === "cash-move-create"}
                    className="shrink-0 px-3"
                  >
                    {busyKey === "cash-move-create" ? "..." : "Agregar"}
                  </GlowButton>
                </div>
                {/* Categoria y monto miden lo mismo: son el mismo campo
                    perceptual y el ojo los recorre como una fila. */}
                <input
                  name="category"
                  required
                  value={moveCategory}
                  onChange={(e) => setMoveCategory(e.target.value)}
                  placeholder="Categoria"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <input
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  value={moveAmount}
                  onChange={(e) => setMoveAmount(e.target.value)}
                  placeholder="Monto"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </form>

              {/* Divisoria: un pelo que se desvanece en los dos extremos, sin
                  caja ni sombra, para partir sin partir de verdad. */}
              <div
                aria-hidden
                className="hidden w-px self-stretch bg-gradient-to-b from-transparent via-slate-200/90 to-transparent sm:block dark:via-zinc-700"
              />

              <div className="flex min-w-0 flex-col gap-2">
                {cashSession?.status === "open" ? (
                  <form onSubmit={handleCloseCashSession} className="flex min-w-0 flex-1 flex-col gap-2">
                    <input
                      name="counted_amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      required
                      value={countedAmount}
                      onChange={(e) => setCountedAmount(e.target.value)}
                      placeholder="Efectivo contado al cierre"
                      className="w-full min-h-[42px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <GlowButton on={canCloseCash} disabled={busyKey === "cash-close"} className="w-full">
                      {busyKey === "cash-close" ? "Cerrando..." : "Cerrar caja"}
                    </GlowButton>
                  </form>
                ) : (
                  <form onSubmit={handleOpenCashSession} className="flex min-w-0 flex-1 flex-col gap-2">
                    <input
                      name="opening_amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      required
                      value={openingAmount}
                      onChange={(e) => setOpeningAmount(e.target.value)}
                      placeholder="Efectivo inicial"
                      className="w-full min-h-[42px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <GlowButton on={canOpenCash} disabled={busyKey === "cash-open"} className="w-full">
                      {busyKey === "cash-open" ? "Abriendo..." : "Abrir caja"}
                    </GlowButton>
                  </form>
                )}
              </div>
            </div>

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
                enorme al lado. En mobile siguen apiladas con el mismo gap.
                `mt-auto` las baja al piso de la card para que el aire que sobra
                quede entre bloques y no como un vacio al final. */}
            <div className="mt-auto grid gap-4 pt-4 sm:grid-cols-2">
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
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      {cashMovementsTruncated ? `Ver los ${cashMovementsTotal} del periodo` : "Ver todos los del periodo"}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5">
                    {/* El total real del periodo, no `cashMovements.length`: el listado
                        viene recortado y antes el contador decia el limite. */}
                    <span className="tabular-nums text-slate-500 dark:text-zinc-400">{cashMovementsTotal}</span>
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
        subtitle={`${cashMovementsTotal} movimiento${cashMovementsTotal === 1 ? "" : "s"} en el periodo`}
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

{/* Historial de liquidaciones, de cualquier periodo. Cada fila se abre para
          ver el detalle turno a turno de como se armo ese número. */}
      <BaseModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Historial de pagos"
        subtitle={history ? `${history.length} pago${history.length === 1 ? "" : "s"}` : undefined}
        maxWidth="lg"
        icon={<History className="h-5 w-5 text-[#0071E3]" />}
      >
        <div className="max-h-[65vh] overflow-y-auto px-5 pb-5">
          {historyBusy ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-400">Cargando...</p>
          ) : !history || history.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-zinc-400">
              Todavia no liquidaste a nadie.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => {
                const pagado = h.status === "paid";
                const abierto = historyDetailId === h.id;
                const items = historyDetail[h.id];
                return (
                  <li
                    key={h.id}
                    className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <button
                      onClick={() => void toggleHistoryDetail(h.id)}
                      aria-expanded={abierto}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800 dark:text-zinc-100">{h.staffName}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              pagado
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            }`}
                          >
                            {LIQUIDATION_STATUS_LABEL[h.status] ?? h.status}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-zinc-400">
                          {formatRangeLabel(h.periodStart, h.periodEnd)} · bruto ${h.grossRevenue.toFixed(2)} · comisión $
                          {h.commissionAmount.toFixed(2)}
                          {h.paidAt && ` · pagado ${new Date(h.paidAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-base font-semibold tabular-nums text-emerald-600">
                          ${h.finalPayable.toFixed(2)}
                        </span>
                        <ChevronRight
                          className={`h-4 w-4 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`}
                          strokeWidth={2}
                        />
                      </span>
                    </button>

                    {abierto && (
                      <div className="border-t border-zinc-200 px-3.5 py-2 dark:border-zinc-800">
                        {historyDetailBusy === h.id ? (
                          <p className="py-3 text-center text-xs text-slate-500 dark:text-zinc-400">Cargando...</p>
                        ) : !items || items.length === 0 ? (
                          <p className="py-3 text-center text-xs text-slate-500 dark:text-zinc-400">
                            Esta liquidacion no tiene turnos cargados.
                          </p>
                        ) : (
                          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                            {items.map((i) => (
                              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-slate-700 dark:text-zinc-200">
                                    {i.serviceName}
                                  </span>
                                  <span className="block text-slate-400 dark:text-zinc-400">
                                    {i.startTime
                                      ? new Date(i.startTime).toLocaleDateString("es-AR", {
                                          day: "2-digit",
                                          month: "2-digit",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "Sin fecha"}
                                  </span>
                                </span>
                                <span className="shrink-0 text-right">
                                  <span className="block tabular-nums text-slate-500 dark:text-zinc-400">
                                    ${i.grossAmount.toFixed(2)}
                                  </span>
                                  <span className="block font-semibold tabular-nums text-emerald-600">
                                    +${i.commissionAmount.toFixed(2)}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </BaseModal>

    </div>
  );
}
