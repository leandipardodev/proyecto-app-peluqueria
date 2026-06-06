"use client";

import { format, startOfWeek, addDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, MessageCircle, X } from "lucide-react";
import { useRef, useState, useEffect, useMemo, useCallback, memo } from "react";
import { motion, useMotionValue, type MotionValue } from "framer-motion";
import { createPortal } from "react-dom";
import { GRID_END_HOUR, GRID_START_HOUR, HOUR_HEIGHT } from "@/lib/calendar-constants";
import {
  extractArgentinaTimeHHmm,
  getArgentinaDateKey,
  getArgentinaMinutesSinceMidnight,
  minutesFromHHmm,
  toArgentinaLocalIsoString,
} from "@/lib/argentina-time";

type Appointment = {
  id: string;
  staff_id: string | null;
  customer_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  loyalty_reward_applied?: boolean;
  deposit_amount?: number | null;
  notes: string | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null } | null;
  staff: { name: string | null; email: string | null } | null;
  services: { name: string; price: number; duration_minutes: number } | null;
};

type NormalizedAppointment = Appointment & {
  start_local_iso: string;
  end_local_iso: string;
  date_key_ar: string;
  start_hhmm: string;
  end_hhmm: string;
  duration_minutes_ar: number;
};

type HoverTooltipState = {
  appointment: NormalizedAppointment;
};

type StaffMember = {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
};

type BusinessHourEntry = { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null };
type BusinessHoursMap = Record<string, BusinessHourEntry>;

interface CalendarViewProps {
  appointments: Appointment[];
  currentDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSlotClick: (date: Date, hour: number) => void;
  onAppointmentClick: (appointment: Appointment | null) => void;
  staffList?: StaffMember[];
  staffFilter?: string | null;
  businessHours?: BusinessHoursMap;
}

function hourFromHHmm(v: string): number {
  const [h] = v.split(":").map(Number);
  return Number.isFinite(h) ? h : 0;
}

type StaffColor = {
  bg: string;
  border: string;
  text: string;
  borderRgba32: string;
  borderRgba85: string;
  borderRgba45: string;
};

const STAFF_COLORS: StaffColor[] = [
  { bg: "#ede9fe", border: "#7c3aed", text: "#4c1d95", borderRgba32: "rgba(124,58,237,0.32)", borderRgba85: "rgba(124,58,237,0.85)", borderRgba45: "rgba(124,58,237,0.45)" },
  { bg: "#d1fae5", border: "#059669", text: "#064e3b", borderRgba32: "rgba(5,150,105,0.32)", borderRgba85: "rgba(5,150,105,0.85)", borderRgba45: "rgba(5,150,105,0.45)" },
  { bg: "#fef9c3", border: "#d97706", text: "#78350f", borderRgba32: "rgba(217,119,6,0.32)", borderRgba85: "rgba(217,119,6,0.85)", borderRgba45: "rgba(217,119,6,0.45)" },
  { bg: "#fce7f3", border: "#db2777", text: "#831843", borderRgba32: "rgba(219,39,119,0.32)", borderRgba85: "rgba(219,39,119,0.85)", borderRgba45: "rgba(219,39,119,0.45)" },
  { bg: "#cffafe", border: "#0891b2", text: "#164e63", borderRgba32: "rgba(8,145,178,0.32)", borderRgba85: "rgba(8,145,178,0.85)", borderRgba45: "rgba(8,145,178,0.45)" },
  { bg: "#fed7aa", border: "#ea580c", text: "#7c2d12", borderRgba32: "rgba(234,88,12,0.32)", borderRgba85: "rgba(234,88,12,0.85)", borderRgba45: "rgba(234,88,12,0.45)" },
  { bg: "#c7d2fe", border: "#4f46e5", text: "#312e81", borderRgba32: "rgba(79,70,229,0.32)", borderRgba85: "rgba(79,70,229,0.85)", borderRgba45: "rgba(79,70,229,0.45)" },
  { bg: "#fecaca", border: "#dc2626", text: "#7f1d1d", borderRgba32: "rgba(220,38,38,0.32)", borderRgba85: "rgba(220,38,38,0.85)", borderRgba45: "rgba(220,38,38,0.45)" },
];

const STATUS_FINAL = new Set(["completed", "cancelled", "no_show"]);

const NowLine = memo(function NowLine({ day, gridStartHour, gridEndHour }: { day: Date; gridStartHour: number; gridEndHour: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const isCurrentDay = getArgentinaDateKey(day) === getArgentinaDateKey(now);
  const nowMinutes = getArgentinaMinutesSinceMidnight(now);
  const minMinutes = gridStartHour * 60;
  const maxMinutes = (gridEndHour + 1) * 60;
  const visible = isCurrentDay && nowMinutes >= minMinutes && nowMinutes <= maxMinutes;
  if (!visible) return null;
  const topPx = ((nowMinutes - minMinutes) / 60) * HOUR_HEIGHT;
  return (
    <div className="absolute pointer-events-none z-20 left-0 right-0" style={{ top: `${topPx}px` }}>
      <div className="relative h-px bg-sky-500/90 shadow-[0_0_6px_rgba(56,189,248,0.45)]">
        <span className="absolute left-0 -top-1.5 w-3 h-3 -translate-x-1/2 rounded-full bg-sky-500/90 shadow-[0_0_0_3px_rgba(56,189,248,0.18),0_0_8px_rgba(56,189,248,0.45)]" />
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.gridStartHour === next.gridStartHour
    && prev.gridEndHour === next.gridEndHour
    && getArgentinaDateKey(prev.day) === getArgentinaDateKey(next.day);
});

const DAY_MAP: Record<number, string> = {
  0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
  4: "thursday", 5: "friday", 6: "saturday",
};

function getTooltipPosition(x: number, y: number): { left: number; top: number } {
  const offset = 15;
  const tooltipWidth = 300;
  const tooltipHeight = 165;
  const padding = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  let left = x + offset;
  let top = y + offset;
  if (left + tooltipWidth > vw - padding) {
    left = x - tooltipWidth - offset;
  }
  if (top + tooltipHeight > vh - padding) {
    top = y - tooltipHeight - offset;
  }
  left = Math.max(padding, left);
  top = Math.max(padding, top);
  return { left, top };
}

const AppointmentBlock = memo(function AppointmentBlock({
  appt,
  startMin,
  durationMin,
  col,
  cols,
  viewMode,
  isMobileViewport,
  staffColorMap,
  isCoarsePointer,
  tooltipX,
  tooltipY,
  gridStartHour,
  onHover,
  onLeave,
  onAppointmentClick,
}: {
  appt: NormalizedAppointment;
  startMin: number;
  durationMin: number;
  col: number;
  cols: number;
  viewMode: "week" | "day";
  isMobileViewport: boolean;
  staffColorMap: Record<string, (typeof STAFF_COLORS)[0]>;
  isCoarsePointer: boolean;
  tooltipX: MotionValue<number>;
  tooltipY: MotionValue<number>;
  gridStartHour: number;
  onHover: (appt: NormalizedAppointment) => void;
  onLeave: () => void;
  onAppointmentClick: (appt: Appointment | null) => void;
}) {
  const isWeekMode = viewMode === "week";
  const isCompact = cols >= 3 || durationMin <= 45;
  const topPx = ((startMin - gridStartHour * 60) / 60) * HOUR_HEIGHT;
  const heightPx = (durationMin / 60) * HOUR_HEIGHT;
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;

  const staffColor = appt.staff
    ? staffColorMap[appt.staff_id || ""] || STAFF_COLORS[0]
    : STAFF_COLORS[0];

  const svcName = appt.services?.name || "";

  const isFinalStatus = STATUS_FINAL.has(appt.status);
  const isCancelled = appt.status === "cancelled" || appt.status === "no_show";
  const isCompleted = appt.status === "completed";
  const isConfirmed = appt.status === "confirmed" || appt.status === "in_progress";
  const needsAttention = appt.status === "scheduled";
  return (
    <div
      className={`absolute pointer-events-auto min-w-0 rounded-tl-xl rounded-bl-xl rounded-br-xl text-xs cursor-pointer bg-white dark:bg-zinc-800/90 border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm group overflow-hidden ${isCancelled ? "opacity-80" : isCompleted ? "opacity-75" : ""}`}
      style={{
        top: `${topPx}px`,
        height: `${Math.max(heightPx - 2, 18)}px`,
        width: `calc(${widthPct}% - 12px)`,
        left: `calc(${leftPct}% + 8px)`,
        fontFamily: "Inter, sans-serif",
        boxShadow: isCancelled
          ? "inset 2px 0 0 rgba(220,38,38,0.4)"
          : `inset 2px 0 0 ${staffColor.borderRgba32}, inset 0 -2px 0 ${staffColor.borderRgba45}`,
        background: isCancelled
          ? "linear-gradient(180deg, rgba(254,202,202,0.68) 0%, rgba(254,226,226,0.36) 46%, rgba(255,255,255,0.22) 100%)"
        : needsAttention
            ? "linear-gradient(180deg, rgba(220,200,230,0.30) 0%, rgba(235,220,240,0.15) 48%, rgba(255,255,255,0.15) 100%)"
        : isCompleted
            ? undefined
            : isConfirmed && isMobileViewport
              ? "linear-gradient(180deg, rgba(186,230,253,0.66) 0%, rgba(224,242,254,0.34) 48%, rgba(255,255,255,0.24) 100%)"
              : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onAppointmentClick(appt);
      }}
      onMouseEnter={(e) => {
        if (isCoarsePointer) return;
        onHover(appt);
        const pos = getTooltipPosition(e.clientX, e.clientY);
        tooltipX.set(pos.left);
        tooltipY.set(pos.top);
      }}
      onMouseMove={(e) => {
        if (isCoarsePointer) return;
        const pos = getTooltipPosition(e.clientX, e.clientY);
        tooltipX.set(pos.left);
        tooltipY.set(pos.top);
      }}
      onMouseLeave={onLeave}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl pointer-events-none" />
      <div className={`relative z-10 flex h-full ${isWeekMode ? "flex-col p-1 gap-0.5" : "flex-col justify-between p-1.5 gap-0.5"}`}>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 flex items-center gap-1">
              <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${isCompleted ? "bg-emerald-500 text-white" : isCancelled ? "bg-rose-500 text-white" : isConfirmed ? "bg-sky-500 text-white" : "bg-amber-500 text-white shadow-sm"}`}>
                {isCompleted ? <Check className="h-2.5 w-2.5" /> : isCancelled ? <X className="h-2.5 w-2.5" /> : isConfirmed ? <CheckCheck className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
              </span>
              <span className={`font-bold leading-tight truncate ${isWeekMode ? "text-[10px]" : isCompact ? "text-[11px]" : "text-xs"} ${isCancelled ? "line-through" : ""} text-gray-900 dark:text-gray-100`}>
                {isWeekMode ? (appt.customers?.nombre?.split(/\s+/)[0] || "Sin") : (appt.customers?.nombre || "Sin cliente")}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {appt.start_hhmm && (
                <span className={`font-mono leading-none ${isWeekMode ? "text-[9px] text-gray-500 dark:text-gray-400" : "text-[10px] text-gray-500 dark:text-gray-400"}`}>{appt.start_hhmm}</span>
              )}
              {appt.customers?.telefono && !isWeekMode && !isMobileViewport && (
                <a
                  href={`https://wa.me/${appt.customers.telefono.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-50/90 p-1 text-emerald-700 hover:bg-emerald-100"
                  title="Enviar WhatsApp"
                >
                  <MessageCircle className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          {svcName && (
            <div className={`flex items-center gap-1.5 leading-tight min-w-0 ${isWeekMode ? "text-[9px] text-gray-500 dark:text-gray-400" : "text-[10px] text-gray-500 dark:text-gray-400"}`}>
              <span className="truncate">{svcName}</span>
              {appt.services?.price != null && !isWeekMode && (
                <span className="shrink-0 font-medium text-gray-700 dark:text-gray-300">${appt.services.price.toLocaleString("es-AR")}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default memo(function CalendarView({
  appointments,
  currentDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  onSlotClick,
  onAppointmentClick,
  staffList,
  staffFilter,
  businessHours,
}: CalendarViewProps) {
  const { weekStart, weekEnd, weekDays } = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    const we = addDays(ws, 6);
    const wd = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    return { weekStart: ws, weekEnd: we, weekDays: wd };
  }, [currentDate]);
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [focusedDayKey, setFocusedDayKey] = useState(() => getArgentinaDateKey(new Date()));
  const [mounted, setMounted] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState | null>(null);
  const tooltipX = useMotionValue(-9999);
  const tooltipY = useMotionValue(-9999);
  const [portalReady, setPortalReady] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleAppointmentHover = useCallback((appt: NormalizedAppointment) => {
    setHoverTooltip({ appointment: appt });
  }, []);
  const handleAppointmentLeave = useCallback(() => {
    setHoverTooltip(null);
  }, []);

  const filteredAppointments = useMemo(() => {
    if (!staffFilter) return appointments;
    return appointments.filter((a) => a.staff_id === staffFilter);
  }, [appointments, staffFilter]);

  const { gridStartHour, gridEndHour, hours } = useMemo(() => {
    if (!businessHours) {
      const fallbackHours: number[] = [];
      for (let i = GRID_START_HOUR; i <= GRID_END_HOUR; i += 1) fallbackHours.push(i);
      return { gridStartHour: GRID_START_HOUR, gridEndHour: GRID_END_HOUR, hours: fallbackHours };
    }

    const openDays = Object.values(businessHours).filter((d) => d?.open);
    if (openDays.length === 0) {
      const fallbackHours: number[] = [];
      for (let i = GRID_START_HOUR; i <= GRID_END_HOUR; i += 1) fallbackHours.push(i);
      return { gridStartHour: GRID_START_HOUR, gridEndHour: GRID_END_HOUR, hours: fallbackHours };
    }

    const minHour = Math.max(0, Math.min(...openDays.map((d) => hourFromHHmm(d.start))));
    const maxHour = Math.min(23, Math.max(...openDays.map((d) => hourFromHHmm(d.end))));
    const normalizedStart = Math.min(minHour, maxHour);
    const normalizedEnd = Math.max(minHour, maxHour);

    const rangeHours: number[] = [];
    for (let i = normalizedStart; i <= normalizedEnd; i += 1) rangeHours.push(i);
    return { gridStartHour: normalizedStart, gridEndHour: normalizedEnd, hours: rangeHours };
  }, [businessHours]);

  const openSlotsByDay = useMemo(() => {
    const map = new Map<string, Set<number>>();
    if (!businessHours) return map;
    for (const [dayKey, dayH] of Object.entries(businessHours)) {
      const slots = new Set<number>();
      if (!dayH?.open) { map.set(dayKey, slots); continue; }
      const [sh, sm] = dayH.start.split(":").map(Number);
      const [eh, em] = dayH.end.split(":").map(Number);
      const blocks: Array<{ start: number; end: number }> = [];
      if (dayH.break_start && dayH.break_end) {
        const [bsh, bsm] = dayH.break_start.split(":").map(Number);
        const [beh, bem] = dayH.break_end.split(":").map(Number);
        blocks.push({ start: sh * 60 + sm, end: bsh * 60 + bsm });
        blocks.push({ start: beh * 60 + bem, end: eh * 60 + em });
      } else {
        blocks.push({ start: sh * 60 + sm, end: eh * 60 + em });
      }
      for (const hour of hours) {
        const slotStart = hour * 60;
        const slotEnd = slotStart + 60;
        if (blocks.some((b) => slotStart < b.end && slotEnd > b.start)) {
          slots.add(hour);
        }
      }
      map.set(dayKey, slots);
    }
    return map;
  }, [businessHours, hours]);

  const normalizedAppointments = useMemo<NormalizedAppointment[]>(() => {
    const byId = new Map<string, Appointment>();
    for (const appt of filteredAppointments) {
      if (!byId.has(appt.id)) byId.set(appt.id, appt);
    }

    return Array.from(byId.values()).map((a) => {
      const startLocalIso = toArgentinaLocalIsoString(a.start_time);
      const endLocalIso = toArgentinaLocalIsoString(a.end_time);
      const startHhmm = extractArgentinaTimeHHmm(startLocalIso);
      const endHhmm = extractArgentinaTimeHHmm(endLocalIso);
      const startMinutes = minutesFromHHmm(startHhmm);
      const endMinutes = minutesFromHHmm(endHhmm);
      const sameDay = getArgentinaDateKey(startLocalIso) === getArgentinaDateKey(endLocalIso);
      const durationMinutes = sameDay
        ? Math.max(endMinutes - startMinutes, 1)
        : Math.max((24 * 60 - startMinutes) + endMinutes, 1);

      return {
        ...a,
        start_local_iso: startLocalIso,
        end_local_iso: endLocalIso,
        date_key_ar: getArgentinaDateKey(startLocalIso),
        start_hhmm: startHhmm,
        end_hhmm: endHhmm,
        duration_minutes_ar: durationMinutes,
      };
    });
  }, [filteredAppointments]);

  const staffColorMap = useMemo(() => {
    const map: Record<string, (typeof STAFF_COLORS)[0]> = {};
    if (!staffList) return map;
    staffList.forEach((s, i) => {
      map[s.id] = STAFF_COLORS[i % STAFF_COLORS.length];
    });
    return map;
  }, [staffList]);

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, NormalizedAppointment[]>();
    for (const day of weekDays) {
      map.set(getArgentinaDateKey(day), []);
    }
    for (const appt of normalizedAppointments) {
      const dayAppointments = map.get(appt.date_key_ar);
      if (dayAppointments) dayAppointments.push(appt);
    }
    for (const [, value] of map) {
      value.sort((a, b) => a.start_hhmm.localeCompare(b.start_hhmm));
    }
    return map;
  }, [normalizedAppointments, weekDays]);

  const displayedDays = useMemo(() => {
    const baseDays = (() => {
      if (viewMode === "week") return weekDays;
      const focus = weekDays.find((d) => getArgentinaDateKey(d) === focusedDayKey);
      return focus ? [focus] : [weekDays[0]];
    })();

    if (!(isMobileViewport && viewMode === "week")) return baseDays;

    const filteredDays = baseDays.filter((day) => {
      const dayKey = DAY_MAP[day.getDay()];
      const dayHours = businessHours?.[dayKey];
      if (!dayHours) return true;
      return dayHours.open;
    });

    return filteredDays.length > 0 ? filteredDays : baseDays;
  }, [focusedDayKey, viewMode, weekDays, isMobileViewport, businessHours]);

  function handleBackToWeek() {
    setViewMode("week");
    setFocusedDayKey(getArgentinaDateKey(currentDate));
  }

  const eventLayoutByDay = useMemo(() => {
    const computeLayout = (appts: NormalizedAppointment[]) => {
      const dayEvents = appts
        .filter((appt) => {
          const startMin = minutesFromHHmm(appt.start_hhmm);
          const endMin = minutesFromHHmm(appt.end_hhmm);
          return endMin > gridStartHour * 60 && startMin < (gridEndHour + 1) * 60;
        })
        .map((appt) => {
          const startMin = Math.max(minutesFromHHmm(appt.start_hhmm), gridStartHour * 60);
          const rawEndMin = Math.min(minutesFromHHmm(appt.end_hhmm), (gridEndHour + 1) * 60);
          const endMin = Math.max(rawEndMin, startMin + 15);
          const durationMin = endMin - startMin;
          return { appt, startMin, endMin, durationMin };
        });

      const sortedEvents = [...dayEvents].sort(
        (a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.appt.id.localeCompare(b.appt.id)
      );

      const eventLayout: Array<{
        appt: NormalizedAppointment;
        startMin: number;
        endMin: number;
        durationMin: number;
        col: number;
        cols: number;
      }> = [];

      let i = 0;
      while (i < sortedEvents.length) {
        const group: typeof sortedEvents = [sortedEvents[i]];
        let groupEnd = sortedEvents[i].endMin;
        i += 1;

        while (i < sortedEvents.length && sortedEvents[i].startMin < groupEnd) {
          group.push(sortedEvents[i]);
          groupEnd = Math.max(groupEnd, sortedEvents[i].endMin);
          i += 1;
        }

        const activeCols: Array<{ endMin: number; col: number }> = [];
        const placed: Array<{
          appt: NormalizedAppointment;
          startMin: number;
          endMin: number;
          durationMin: number;
          col: number;
        }> = [];
        let maxCols = 1;

        for (const event of group) {
          for (let idx = activeCols.length - 1; idx >= 0; idx -= 1) {
            if (activeCols[idx].endMin <= event.startMin) activeCols.splice(idx, 1);
          }

          let col = 0;
          while (activeCols.some((slot) => slot.col === col)) col += 1;
          activeCols.push({ endMin: event.endMin, col });
          maxCols = Math.max(maxCols, activeCols.length);

          placed.push({ ...event, col });
        }

        for (const event of placed) {
          eventLayout.push({ ...event, cols: maxCols });
        }
      }

      return eventLayout;
    };

    const map = new Map<string, ReturnType<typeof computeLayout>>();
    for (const day of displayedDays) {
      const dayKey = getArgentinaDateKey(day);
      const appts = appointmentsByDay.get(dayKey) || [];
      map.set(dayKey, computeLayout(appts));
    }
    return map;
  }, [displayedDays, appointmentsByDay, gridStartHour, gridEndHour]);

  function handleTodayClick() {
    onToday();
    if (viewMode === "day") {
      setFocusedDayKey(getArgentinaDateKey(new Date()));
    }
  }

  function handlePrevPeriod() {
    if (viewMode === "week") {
      onPrevWeek();
      return;
    }

    const baseFocused = new Date(`${focusedDayKey}T12:00:00`);
    const nextFocused = addDays(baseFocused, -1);
    setFocusedDayKey(getArgentinaDateKey(nextFocused));

    if (nextFocused < weekStart) {
      onPrevWeek();
    }
  }

  function handleNextPeriod() {
    if (viewMode === "week") {
      onNextWeek();
      return;
    }

    const baseFocused = new Date(`${focusedDayKey}T12:00:00`);
    const nextFocused = addDays(baseFocused, 1);
    setFocusedDayKey(getArgentinaDateKey(nextFocused));

    if (nextFocused > weekEnd) {
      onNextWeek();
    }
  }

  const slotHeight = HOUR_HEIGHT;

  useEffect(() => {
    setMounted(true);
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobileViewport) return;
    setFocusedDayKey(getArgentinaDateKey(new Date()));
    setViewMode("day");
  }, [mounted]);

  useEffect(() => {
    if (isCoarsePointer) {
      setHoverTooltip(null);
    }
  }, [isCoarsePointer]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        isDragging.current = true;
        startX.current = e.pageX - container.offsetLeft;
        scrollLeft.current = container.scrollLeft;
        container.style.cursor = "grabbing";
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX.current) * 1.5;
      container.scrollLeft = scrollLeft.current - walk;
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      if (container) container.style.cursor = "default";
    };

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("mouseleave", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("mouseleave", handleMouseUp);
    };
  }, []);

  const styleTag = useMemo(() => (
    <style>{`
      .closed-slot-pattern {
        background-image: repeating-linear-gradient(
          45deg,
          transparent,
          transparent 10px,
          rgba(0, 0, 0, 0.08) 10px,
          rgba(0, 0, 0, 0.08) 20px
        );
      }
      .dark .closed-slot-pattern {
        background-image: repeating-linear-gradient(
          45deg,
          transparent,
          transparent 10px,
          rgba(255, 255, 255, 0.16) 10px,
          rgba(255, 255, 255, 0.16) 20px
        );
      }
    `}</style>
  ), []);

  if (!mounted) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-20 h-9 bg-zinc-200/40 dark:bg-zinc-700/30 rounded-xl animate-pulse" />
            <div className="w-20 h-9 bg-zinc-200/40 dark:bg-zinc-700/30 rounded-xl animate-pulse" />
            <div className="w-16 h-9 bg-zinc-200/40 dark:bg-zinc-700/30 rounded-xl animate-pulse ml-2" />
          </div>
          <div className="w-64 h-6 bg-zinc-200/40 dark:bg-zinc-700/30 rounded animate-pulse hidden sm:block" />
        </div>
        <div className="flex-1 bg-zinc-100/30 dark:bg-zinc-800/20 rounded-2xl backdrop-blur-xl animate-pulse border border-white/10" />
      </div>
    );
  }

  const isMobileDayMode = isMobileViewport && viewMode === "day";
  const hideHourColumnOnMobile = isMobileViewport;
  const hourColumnWidth = isMobileViewport ? 40 : 56;
  const todayIdx = displayedDays.findIndex((d) => isToday(d));

  return (
    <div className="calendar-shell flex flex-col h-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrevPeriod}
            className="p-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 shadow-sm transition-all cursor-pointer select-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNextPeriod}
            className="p-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 shadow-sm transition-all cursor-pointer select-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleTodayClick}
            className="px-3 py-1.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-2xl shadow-sm transition-all cursor-pointer select-none"
          >
            Hoy
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white hidden sm:block">
          {format(displayedDays[0], "d 'de' MMMM", { locale: es })} —{" "}
          {format(displayedDays[displayedDays.length - 1], "d 'de' MMMM 'de' yyyy", {
            locale: es,
          })}
        </h2>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white sm:hidden">
          {format(displayedDays[0], "d MMM", { locale: es })} -{" "}
          {format(displayedDays[displayedDays.length - 1], "d MMM", { locale: es })}
        </h2>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        <div
          className="grid border border-zinc-200/60 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-50 dark:bg-zinc-900 relative"
          style={{
            gridTemplateColumns:
              viewMode === "day"
                ? isMobileDayMode
                  ? "1fr"
                  : `${hourColumnWidth}px minmax(0, 1fr)`
                : hideHourColumnOnMobile
                  ? `repeat(${Math.max(displayedDays.length, 1)}, 140px)`
                  : `${hourColumnWidth}px repeat(7, minmax(0, 1fr))`,
            ...(hideHourColumnOnMobile ? { width: "max-content", minWidth: "100%" } : { minWidth: "0px" }),
          }}
        >
          {!hideHourColumnOnMobile && (
            <div className={`col-span-1 border-r border-zinc-200/50 dark:border-zinc-800 ${todayIdx === 0 ? "rounded-tl-2xl overflow-hidden" : ""}`}>
              <div className="border-b border-zinc-200/50 dark:border-zinc-800" style={{ height: `${slotHeight}px` }} />
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="flex items-center justify-end pr-2"
                  style={{ height: `${slotHeight}px` }}
                >
                  <span className="text-[10px] sm:text-sm font-medium text-gray-500 dark:text-gray-400 leading-none">
                    {`${String(hour).padStart(2, "0")}:00`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {displayedDays.map((day, dayIndex) => {
            const dayStr = getArgentinaDateKey(day);
            const dayKey = DAY_MAP[day.getDay()];
            const dayHours = businessHours?.[dayKey];
            const dayFullyClosed = dayHours && !dayHours.open;
            return (
              <div
                key={dayStr}
                className={`col-span-1 border-r border-zinc-200/50 dark:border-zinc-800 border-l-2 border-l-zinc-200 dark:border-l-zinc-700 last:border-r-0 flex flex-col ${dayFullyClosed ? "opacity-60" : ""}`}
              >
                <div
                  className={`group border-b border-zinc-200/50 dark:border-zinc-800 flex flex-col items-center justify-center shrink-0 transition-all ${
                    isToday(day) || viewMode === "day"
                      ? "bg-sky-100 dark:bg-slate-800 rounded-t-2xl overflow-hidden cursor-pointer hover:bg-sky-200 dark:hover:bg-slate-700"
                      : ""
                  }`}
                  style={{ height: `${slotHeight}px` }}
                  onClick={() => {
                    if (viewMode === "day") {
                      handleBackToWeek();
                    } else if (isToday(day)) {
                      setFocusedDayKey(dayStr);
                      setViewMode("day");
                    }
                  }}
                >
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      isToday(day)
                        ? "text-sky-700 dark:text-sky-300"
                        : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {isToday(day) && (
                    <span className="inline-flex items-center gap-1 mt-0.5">
                      <span className="relative flex w-1.5 h-1.5">
                        <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-red-500" />
                      </span>
                      <span className="text-[9px] font-semibold text-red-500 uppercase tracking-wider">Hoy</span>
                    </span>
                  )}
                  {dayFullyClosed && (
                    <span className="text-[9px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mt-0.5">Cerrado</span>
                  )}
                  {(isToday(day) || viewMode === "day") && (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
                      <div
                        className="flex items-center gap-0.5 text-[9px] text-zinc-400 dark:text-zinc-500"
                      >
                        {viewMode === "day" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <span>{viewMode === "day" ? "semana" : "día"}</span>
                      </div>
                    </div>
                  )}
                </div>

                <>
                  <div
                    className="grid flex-1 relative"
                    style={{
                      gridTemplateRows: `repeat(${hours.length}, ${slotHeight}px)`,
                    }}
                  >
                    {hours.map((hour) => {
                      const isOpenSlot = openSlotsByDay.get(dayKey)?.has(hour) ?? false;
                      return (
                      <div
                        key={hour}
                        className={`relative overflow-visible border-b border-zinc-200/30 dark:border-zinc-800/40 last:border-b-0 transition-colors ${(isMobileDayMode || (isMobileViewport && viewMode === "week" && dayIndex === 0)) ? "pl-7 pr-1 py-1.5" : "p-1.5"} ${
                          isOpenSlot
                            ? "hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            : "bg-zinc-100 dark:bg-zinc-950 border-y border-y-zinc-200 dark:border-y-zinc-800 closed-slot-pattern"
                        }`}
                        onClick={isOpenSlot ? () => onSlotClick(day, hour) : undefined}
                      >
                        {(isMobileDayMode || (isMobileViewport && viewMode === "week" && dayIndex === 0)) && (
                          <span className="absolute left-1 top-1 text-[8px] font-medium text-gray-500 dark:text-gray-400 select-none pointer-events-none">
                            {`${String(hour).padStart(2, "0")}:00`}
                          </span>
                        )}
                      </div>
                    );})}

                    <div
                      className="absolute inset-0 pointer-events-none z-10"
                    >
                      {(eventLayoutByDay.get(dayStr) || []).map((event) => (
                        <AppointmentBlock
                          key={event.appt.id}
                          appt={event.appt}
                          startMin={event.startMin}
                          durationMin={event.durationMin}
                          col={event.col}
                          cols={event.cols}
                          viewMode={viewMode}
                          isMobileViewport={isMobileViewport}
                          staffColorMap={staffColorMap}
                          isCoarsePointer={isCoarsePointer}
                          tooltipX={tooltipX}
                          tooltipY={tooltipY}
                          gridStartHour={gridStartHour}
                          onHover={handleAppointmentHover}
                          onLeave={handleAppointmentLeave}
                          onAppointmentClick={onAppointmentClick}
                        />
                      ))}

                      <NowLine day={day} gridStartHour={gridStartHour} gridEndHour={gridEndHour} />
                    </div>
                  </div>
                </>
              </div>
            );
          })}
        </div>
      </div>

      {portalReady && !isCoarsePointer && createPortal((
        <>
          {hoverTooltip && (() => {
            const tipAppt = hoverTooltip.appointment;
            const humanDate = format(new Date(tipAppt.start_local_iso), "EEEE d MMMM", { locale: es });
            return (
              <motion.div
                key={tipAppt.id}
                className="fixed left-0 top-0 pointer-events-none z-[60] w-[300px] rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-black/90 shadow-lg px-4 py-3 text-gray-900 dark:text-white"
                style={{ x: tooltipX, y: tooltipY }}
              >
              <div className="text-base font-semibold leading-tight">
                👤 {tipAppt.customers?.nombre || "Sin cliente"}
              </div>
              <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                📅 {humanDate.charAt(0).toUpperCase() + humanDate.slice(1)}
              </div>
              <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                ⏰ {tipAppt.start_hhmm} - {tipAppt.end_hhmm}
              </div>
              {tipAppt.services?.name && (
                <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  ✂️ {tipAppt.services.name}
                </div>
              )}
              {tipAppt.customers?.email && (
                <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  📧 {tipAppt.customers.email}
                </div>
              )}
              <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                💈 {tipAppt.staff?.name || "Sin asignar"}
              </div>
              {tipAppt.deposit_amount && tipAppt.deposit_amount > 0 && (
                <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  💵 Seña: ${tipAppt.deposit_amount.toFixed(2)}
                </div>
              )}
            </motion.div>
          );
        })()}
      </>
      ), document.body)}

      {businessHours && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">
          <div className="w-3 h-3 rounded-sm closed-slot-pattern border border-zinc-300/40 dark:border-white/10" style={{ backgroundSize: "6px 6px" }} />
          <span>Cerrado</span>
        </div>
      )}
      {styleTag}
    </div>
  );
})
