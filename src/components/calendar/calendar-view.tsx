"use client";

import { format, startOfWeek, addDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useEffect, useMemo, memo } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
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
  deposit_amount?: number | null;
  notes: string | null;
  customers: { nombre: string | null; email: string; telefono: string | null } | null;
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

const hours = (() => {
  const h: number[] = [];
  for (let i = GRID_START_HOUR; i <= GRID_END_HOUR; i++) h.push(i);
  h.push(0);
  return h;
})();

const STAFF_COLORS = [
  { bg: "#f3e8ff", border: "#c084fc", text: "#6b21a8" },
  { bg: "#d1fae5", border: "#34d399", text: "#065f46" },
  { bg: "#fef3c7", border: "#fbbf24", text: "#92400e" },
  { bg: "#ffe4e6", border: "#fb7185", text: "#9f1239" },
  { bg: "#cffafe", border: "#22d3ee", text: "#155e75" },
  { bg: "#ffedd5", border: "#fb923c", text: "#9a3412" },
  { bg: "#e0e7ff", border: "#818cf8", text: "#3730a3" },
  { bg: "#fce7f3", border: "#f472b6", text: "#9d174d" },
];

const STATUS_STYLES: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  scheduled:    { bg: "#fef3c7", border: "#f59e0b", dot: "#f59e0b", label: "A confirmar" },
  confirmed:    { bg: "#dcfce7", border: "#22c55e", dot: "#22c55e", label: "Confirmado" },
  in_progress:  { bg: "#dcfce7", border: "#22c55e", dot: "#22c55e", label: "Confirmado" },
  completed:    { bg: "#f0fdf4", border: "#16a34a", dot: "#16a34a", label: "Completado" },
  cancelled:    { bg: "#fef2f2", border: "#ef4444", dot: "#ef4444", label: "Cancelado" },
  no_show:      { bg: "#fef2f2", border: "#ef4444", dot: "#ef4444", label: "Cancelado" },
};

const STATUS_FINAL = new Set(["completed", "cancelled", "no_show"]);
const MOTION_PRESET = {
  pill: { stiffness: 460, damping: 30, mass: 0.55 },
  tooltipFollow: { stiffness: 340, damping: 36, mass: 0.58 },
  tooltipInOut: { stiffness: 430, damping: 34, mass: 0.56 },
};

function extractEmoji(name: string): { emoji: string; label: string } {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return { emoji: parts[0], label: parts.slice(1).join(" ") };
  }
  return { emoji: "", label: name };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTurnoStatusLabel(status: string, isPaid: boolean): string {
  if (status === "pending_payment") return "Pago pendiente";
  if (status === "scheduled" && !isPaid) return "A confirmar";
  if (status === "scheduled" && isPaid) return "Señado";
  if (status === "confirmed" || status === "in_progress") return "Confirmado";
  if (status === "completed") return "Completado";
  if (status === "cancelled" || status === "no_show") return "Cancelado";
  return status;
}

const DAY_MAP: Record<number, string> = {
  0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
  4: "thursday", 5: "friday", 6: "saturday",
};

function getGridRow(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const totalMinutes = (h - GRID_START_HOUR) * 60 + m;
  return 1 + totalMinutes / 60;
}

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
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [focusedDayKey, setFocusedDayKey] = useState(() => getArgentinaDateKey(new Date()));
  const [mounted, setMounted] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const tooltipTargetX = useMotionValue(0);
  const tooltipTargetY = useMotionValue(0);
  const tooltipX = useSpring(tooltipTargetX, MOTION_PRESET.tooltipFollow);
  const tooltipY = useSpring(tooltipTargetY, MOTION_PRESET.tooltipFollow);

  const filteredAppointments = useMemo(() => {
    if (!staffFilter) return appointments;
    return appointments.filter((a) => a.staff_id === staffFilter);
  }, [appointments, staffFilter]);

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
    const map = new Map<string, typeof STAFF_COLORS[0]>();
    if (!staffList) return map;
    staffList.forEach((s, i) => {
      map.set(s.id, STAFF_COLORS[i % STAFF_COLORS.length]);
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

  const appointmentsByDayHour = useMemo(() => {
    const map = new Map<string, NormalizedAppointment[]>();
    for (const day of weekDays) {
      const dayStr = getArgentinaDateKey(day);
      for (const hour of hours) {
        map.set(`${dayStr}-${hour}`, []);
      }
    }

    for (const appt of normalizedAppointments) {
      const startHour = Number.parseInt(appt.start_hhmm.slice(0, 2), 10);
      const startHourInGrid = startHour === 24 ? 0 : startHour;
      const key = `${appt.date_key_ar}-${startHourInGrid}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(appt);
      }
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
  const hourColumnWidth = isMobileViewport ? 40 : 80;

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

  return (
    <div className="calendar-shell flex flex-col h-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrevPeriod}
            className="p-2 rounded-2xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-black/30 hover:bg-white/70 dark:hover:bg-white/10 backdrop-blur-md shadow-sm transition-all cursor-pointer select-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNextPeriod}
            className="p-2 rounded-2xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-black/30 hover:bg-white/70 dark:hover:bg-white/10 backdrop-blur-md shadow-sm transition-all cursor-pointer select-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="px-3 py-1.5 text-sm font-medium border border-white/50 dark:border-white/10 bg-white/40 dark:bg-black/30 hover:bg-white/70 dark:hover:bg-white/10 backdrop-blur-md rounded-2xl shadow-sm transition-all cursor-pointer select-none"
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
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 8, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="grid border border-white/10 dark:border-white/5 border-t border-l border-white/40 dark:border-t-white/20 dark:border-l-white/20 border-b border-r border-black/5 dark:border-b-white/5 dark:border-r-white/5 rounded-[2.5rem] overflow-hidden bg-white/20 dark:bg-black/10 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.03)] dark:shadow-none relative"
          style={{
            gridTemplateColumns:
              viewMode === "day"
                ? isMobileDayMode
                  ? "minmax(0, 1fr)"
                  : `${hourColumnWidth}px minmax(0, 1fr)`
                : hideHourColumnOnMobile
                  ? `repeat(${Math.max(displayedDays.length, 1)}, minmax(0, 1fr))`
                  : `${hourColumnWidth}px repeat(7, minmax(0, 1fr))`,
            minWidth: "0px",
          }}
        >
          {!hideHourColumnOnMobile && (
            <div className="col-span-1 border-r border-zinc-200/30 dark:border-white/10">
              <div className="border-b border-zinc-200/30 dark:border-white/10" style={{ height: `${slotHeight}px` }} />
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="flex items-start justify-end pr-1 sm:pr-2 pt-1"
                  style={{ height: `${slotHeight}px` }}
                >
                  <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
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
            const dayAppointments = appointmentsByDay.get(dayStr) || [];

            return (
              <div
                key={dayStr}
                className={`col-span-1 border-r border-zinc-200/30 dark:border-white/10 border-l-2 border-l-[#e2e8f0] last:border-r-0 flex flex-col ${dayFullyClosed ? "opacity-60" : ""}`}
              >
                <div
                  className={`group border-b border-zinc-200/30 dark:border-white/10 flex flex-col items-center justify-center shrink-0 transition-all ${
                    isToday(day)
                      ? "bg-sky-100/50 dark:bg-slate-800/40 cursor-pointer hover:bg-sky-100/70 dark:hover:bg-slate-800/55"
                      : ""
                  }`}
                  style={{ height: `${slotHeight}px` }}
                  onClick={() => {
                    if (isToday(day)) {
                      if (viewMode === "day" && focusedDayKey === dayStr) {
                        handleBackToWeek();
                      } else {
                        setFocusedDayKey(dayStr);
                        setViewMode("day");
                      }
                    }
                  }}
                >
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <motion.span
                    className={`text-sm font-semibold ${
                      isToday(day)
                        ? "text-sky-700 dark:text-sky-300 group-hover:scale-110"
                        : "text-gray-900 dark:text-gray-100"
                    }`}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    {format(day, "d")}
                  </motion.span>
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
                </div>

                {(() => {
                  const dayEvents = dayAppointments
                    .filter((appt) => {
                      const startMin = minutesFromHHmm(appt.start_hhmm);
                      const endMin = minutesFromHHmm(appt.end_hhmm);
                      return endMin > GRID_START_HOUR * 60 && startMin < (GRID_END_HOUR + 1) * 60;
                    })
                    .map((appt) => {
                      const startMin = Math.max(minutesFromHHmm(appt.start_hhmm), GRID_START_HOUR * 60);
                      const endMin = Math.min(minutesFromHHmm(appt.end_hhmm), (GRID_END_HOUR + 1) * 60);
                      const durationMin = Math.max(endMin - startMin, 15);
                      return { appt, startMin, endMin, durationMin };
                    });

                  const eventLayout = dayEvents.map((event) => {
                    const overlaps = dayEvents
                      .filter((candidate) => candidate.appt.id !== event.appt.id)
                      .filter((candidate) => candidate.startMin < event.endMin && candidate.endMin > event.startMin)
                      .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

                    const cluster = [event, ...overlaps].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
                    const colById = new Map<string, number>();
                    const activeCols: Array<{ endMin: number; col: number }> = [];

                    for (const item of cluster) {
                      for (let i = activeCols.length - 1; i >= 0; i--) {
                        if (activeCols[i].endMin <= item.startMin) activeCols.splice(i, 1);
                      }
                      let col = 0;
                      while (activeCols.some((a) => a.col === col)) col += 1;
                      activeCols.push({ endMin: item.endMin, col });
                      colById.set(item.appt.id, col);
                    }

                    const thisCol = colById.get(event.appt.id) || 0;
                    const cols = Math.max(...Array.from(colById.values()), 0) + 1;
                    return { ...event, col: thisCol, cols };
                  });

                  return (
                    <>
                      <div
                        className="grid flex-1 relative"
                        style={{
                          gridTemplateRows: `repeat(${hours.length}, ${slotHeight}px)`,
                        }}
                      >
                        {hours.map((hour) => {
                          const hourNum = hour === 0 && GRID_START_HOUR > 0 ? 24 : hour;
                          const dayH = dayHours;
                          const isOpenSlot = (() => {
                            if (!dayH?.open) return false;
                            const [sh, sm] = dayH.start.split(":").map(Number);
                            const [eh, em] = dayH.end.split(":").map(Number);
                            const slotStart = hourNum * 60;
                            const slotEnd = slotStart + 60;

                            const blocks: Array<{ start: number; end: number }> = [];
                            if (dayH.break_start && dayH.break_end) {
                              const [bsh, bsm] = dayH.break_start.split(":").map(Number);
                              const [beh, bem] = dayH.break_end.split(":").map(Number);
                              blocks.push({ start: sh * 60 + sm, end: bsh * 60 + bsm });
                              blocks.push({ start: beh * 60 + bem, end: eh * 60 + em });
                            } else {
                              blocks.push({ start: sh * 60 + sm, end: eh * 60 + em });
                            }

                            return blocks.some((b) => slotStart < b.end && slotEnd > b.start);
                          })();
                          return (
                          <div
                            key={hour}
                            className={`relative overflow-visible border-b border-zinc-200/30 dark:border-slate-800/40 last:border-b-0 transition-colors ${(isMobileDayMode || (isMobileViewport && viewMode === "week" && dayIndex === 0)) ? "pl-7 pr-1 py-1.5" : "p-1.5"} ${
                              isOpenSlot
                                ? "hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer"
                                : "bg-slate-200 dark:bg-zinc-950 border-y border-y-black/[0.08] dark:border-y-white/[0.03]"
                            }`}
                            style={
                              isOpenSlot
                                ? undefined
                                : {
                                    backgroundImage:
                                      "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px)",
                                  }
                            }
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
                          className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
                          style={{ top: 0 }}
                        >
                          {eventLayout.map(({ appt, startMin, durationMin, col, cols }) => {
                            const isWeekMode = viewMode === "week";
                            const isCompact = cols >= 3 || durationMin <= 45;
                            const topPx = ((startMin - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                            const heightPx = (durationMin / 60) * HOUR_HEIGHT;
                            const widthPct = 100 / cols;
                            const leftPct = col * widthPct;

                            const staffColor = appt.staff
                              ? staffColorMap.get(appt.staff_id || "") || STAFF_COLORS[0]
                              : STAFF_COLORS[0];

                            const svc = appt.services?.name
                              ? extractEmoji(appt.services.name)
                              : { emoji: "", label: "" };

                            const statusStyle = STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled;
                            const isFinalStatus = STATUS_FINAL.has(appt.status);
                            const needsAttention = appt.status === "scheduled";
                            const displayLabel = getTurnoStatusLabel(appt.status, appt.is_paid);

                            return (
                              <motion.div
                                key={appt.id}
                                className={`absolute pointer-events-auto min-w-0 rounded-xl text-xs cursor-pointer bg-white/90 dark:bg-white/10 backdrop-blur-md border border-white/45 dark:border-white/20 shadow-sm group overflow-hidden ${isFinalStatus ? "opacity-50" : ""} ${needsAttention ? "animate-pulse-border" : ""}`}
                                style={{
                                  top: `${topPx}px`,
                                  height: `${Math.max(heightPx - 2, 18)}px`,
                                  width: `calc(${widthPct}% - 6px)`,
                                  left: `calc(${leftPct}% + 3px)`,
                                  fontFamily: "Inter, sans-serif",
                                  boxShadow: `inset 2px 0 0 ${hexToRgba(staffColor.border, 0.32)}`,
                                }}
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: "spring", ...MOTION_PRESET.pill }}
                                whileHover={{ y: -1, boxShadow: "0 12px 24px rgba(15, 23, 42, 0.12)" }}
                                whileTap={{ scale: 0.985 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAppointmentClick(appt);
                                }}
                                onMouseEnter={(e) => {
                                  if (isCoarsePointer) return;
                                  const pos = { x: e.clientX, y: e.clientY };
                                  const adjusted = getTooltipPosition(pos.x, pos.y);
                                  tooltipTargetX.set(adjusted.left);
                                  tooltipTargetY.set(adjusted.top);
                                  setHoverTooltip({ appointment: appt });
                                }}
                                onMouseMove={(e) => {
                                  if (isCoarsePointer) return;
                                  const adjusted = getTooltipPosition(e.clientX, e.clientY);
                                  tooltipTargetX.set(adjusted.left);
                                  tooltipTargetY.set(adjusted.top);
                                }}
                                onMouseLeave={() => {
                                  setHoverTooltip(null);
                                }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl pointer-events-none" />
                                <div
                                  className="absolute inset-y-0 left-0 w-[3px] pointer-events-none"
                                  style={{
                                    background: `linear-gradient(180deg, ${hexToRgba(staffColor.border, 0.85)} 0%, ${hexToRgba(staffColor.border, 0.45)} 100%)`,
                                  }}
                                />
                                <div className={`relative z-10 flex h-full ${isWeekMode ? "flex-col justify-around p-1.5 gap-1" : "flex-col justify-between p-1.5 gap-0.5"}`}>
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className={`font-bold text-gray-900 dark:text-gray-100 leading-tight truncate ${isWeekMode ? "text-[10px]" : isCompact ? "text-[11px]" : "text-xs"}`}>
                                        {appt.customers?.nombre || "Sin cliente"}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {!isWeekMode && svc.emoji && <span className="text-sm leading-none">{svc.emoji}</span>}
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${needsAttention ? "animate-pulse" : ""}`} style={{ backgroundColor: needsAttention ? "#ef4444" : statusStyle.dot }} />
                                      </div>
                                    </div>
                                    <span className={`text-gray-700 dark:text-gray-300 leading-tight truncate ${isWeekMode ? "text-[9px]" : isCompact ? "text-[10px]" : "text-[11px]"}`}>
                                      {appt.start_hhmm} - {appt.end_hhmm}
                                    </span>
                                    {appt.services?.name && (
                                      <span className={`text-gray-700/90 dark:text-gray-300/90 leading-tight truncate ${isWeekMode ? "text-[9px]" : isCompact ? "text-[10px]" : "text-[11px]"}`}>
                                        {svc.emoji ? `${svc.emoji} ` : ""}
                                        {svc.label || appt.services.name}
                                      </span>
                                    )}
                                    {!isWeekMode && (
                                      <span className="text-[9px] font-semibold text-gray-600 dark:text-gray-300 leading-tight truncate">
                                        {displayLabel}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}

                          {(() => {
                            const now = new Date();
                            const isCurrentDay = getArgentinaDateKey(day) === getArgentinaDateKey(now);
                            const nowMinutes = getArgentinaMinutesSinceMidnight(now);
                            const minMinutes = GRID_START_HOUR * 60;
                            const maxMinutes = (GRID_END_HOUR + 1) * 60;
                            const visible = isCurrentDay && nowMinutes >= minMinutes && nowMinutes <= maxMinutes;
                            if (!visible) return null;
                            const topPx = ((nowMinutes - minMinutes) / 60) * HOUR_HEIGHT;
                            return (
                              <div
                                className="absolute pointer-events-none z-20 left-0 right-0"
                                style={{ top: `${topPx}px` }}
                              >
                                <div className="relative h-px bg-sky-500/90 shadow-[0_0_6px_rgba(56,189,248,0.45)]">
                                  <span className="absolute left-0 -top-1.5 w-3 h-3 -translate-x-1/2 rounded-full bg-sky-500/90 shadow-[0_0_0_3px_rgba(56,189,248,0.18),0_0_8px_rgba(56,189,248,0.45)]" />
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                </div>
              </>
            );
          })()}
              </div>
            );
          })}
        </motion.div>
      </div>

      <AnimatePresence>
        {!isCoarsePointer && hoverTooltip && (() => {
          const tipAppt = hoverTooltip.appointment;
          const humanDate = format(new Date(tipAppt.start_local_iso), "EEEE d MMMM", { locale: es });
          return (
            <motion.div
              key={tipAppt.id}
              className="fixed left-0 top-0 pointer-events-none z-[60] w-[300px] rounded-xl border border-black/5 dark:border-white/10 bg-white/90 dark:bg-black/80 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-[10px] px-4 py-3 text-gray-900 dark:text-white"
              style={{ x: tooltipX, y: tooltipY }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", ...MOTION_PRESET.tooltipInOut }}
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
              {(() => {
                const tipSvc = tipAppt.services?.name
                  ? extractEmoji(tipAppt.services.name)
                  : null;
                return tipSvc ? (
                  <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    ✂️ {tipSvc.emoji} {tipSvc.label}
                  </div>
                ) : null;
              })()}
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
      </AnimatePresence>

      {businessHours && (
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs bg-white/30 dark:bg-black/20 backdrop-blur-2xl rounded-2xl px-4 py-2.5 border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-sm text-gray-600 dark:text-gray-400">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)" }} />
          <span>Cerrado</span>
        </div>
      )}
    </div>
  );
})
