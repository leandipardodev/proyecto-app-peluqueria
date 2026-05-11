"use client";

import { format, startOfWeek, addDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { GRID_END_HOUR, GRID_START_HOUR, HOUR_HEIGHT } from "@/lib/calendar-constants";
import {
  extractArgentinaTimeHHmm,
  getArgentinaDateKey,
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
  notes: string | null;
  customers: { name: string; email: string; phone: string | null } | null;
  staff: { name: string; email: string } | null;
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
  scheduled:    { bg: "#eff6ff", border: "#3b82f6", dot: "#3b82f6", label: "Programado" },
  confirmed:    { bg: "#f0fdf4", border: "#22c55e", dot: "#22c55e", label: "Confirmado" },
  in_progress:  { bg: "#fffbeb", border: "#f59e0b", dot: "#f59e0b", label: "En curso" },
  completed:    { bg: "#f9fafb", border: "#9ca3af", dot: "#9ca3af", label: "Completado" },
  cancelled:    { bg: "#fef2f2", border: "#ef4444", dot: "#ef4444", label: "Cancelado" },
  no_show:      { bg: "#fff7ed", border: "#f97316", dot: "#f97316", label: "No asistió" },
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

const statusLabels: Record<string, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

function computeOverlapLayout<T extends { id: string; start_time: string; end_time: string }>(
  dayAppointments: T[]
): Map<string, { width: number; left: number }> {
  const layout = new Map<string, { width: number; left: number }>();

  if (dayAppointments.length <= 1) {
    for (const apt of dayAppointments) {
      layout.set(apt.id, { width: 100, left: 0 });
    }
    return layout;
  }

  const sorted = [...dayAppointments].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    if (layout.has(sorted[i].id)) continue;

    const group: T[] = [sorted[i]];
    for (let j = i + 1; j < sorted.length; j++) {
      const overlapsWithGroup = group.some((g) => {
        const gStart = new Date(g.start_time).getTime();
        const gEnd = new Date(g.end_time).getTime();
        const jStart = new Date(sorted[j].start_time).getTime();
        const jEnd = new Date(sorted[j].end_time).getTime();
        return gStart < jEnd && gEnd > jStart;
      });
      if (overlapsWithGroup) group.push(sorted[j]);
    }

    for (let k = 0; k < group.length; k++) {
      layout.set(group[k].id, {
        width: 100 / group.length,
        left: (k / group.length) * 100,
      });
    }
  }

  return layout;
}

function getTopOffset(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const totalHours = h + m / 60;
  return (totalHours - GRID_START_HOUR) * HOUR_HEIGHT;
}

export default function CalendarView({
  appointments,
  currentDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  onSlotClick,
  onAppointmentClick,
  staffList,
  staffFilter,
}: CalendarViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [mounted, setMounted] = useState(false);
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
    return map;
  }, [normalizedAppointments, weekDays]);

  const dayLayouts = useMemo(() => {
    const layouts = new Map<string, Map<string, { width: number; left: number }>>();
    for (const day of weekDays) {
      const dayStr = getArgentinaDateKey(day);
      const dayAppts = appointmentsByDay.get(dayStr) || [];
      layouts.set(dayStr, computeOverlapLayout(dayAppts));
    }
    return layouts;
  }, [appointmentsByDay, weekDays]);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevWeek}
            className="p-2 rounded-2xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-black/30 hover:bg-white/70 dark:hover:bg-white/10 backdrop-blur-md shadow-sm transition-all cursor-pointer select-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onNextWeek}
            className="p-2 rounded-2xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-black/30 hover:bg-white/70 dark:hover:bg-white/10 backdrop-blur-md shadow-sm transition-all cursor-pointer select-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="ml-2 px-3 py-1.5 text-sm font-medium border border-white/50 dark:border-white/10 bg-white/40 dark:bg-black/30 hover:bg-white/70 dark:hover:bg-white/10 backdrop-blur-md rounded-2xl shadow-sm transition-all cursor-pointer select-none"
          >
            Hoy
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white hidden sm:block">
          {format(weekStart, "d 'de' MMMM", { locale: es })} —{" "}
          {format(addDays(weekStart, 6), "d 'de' MMMM 'de' yyyy", {
            locale: es,
          })}
        </h2>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white sm:hidden">
          {format(weekStart, "d MMM", { locale: es })} -{" "}
          {format(addDays(weekStart, 6), "d MMM", { locale: es })}
        </h2>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        <div className="grid grid-cols-8 min-w-[700px] border border-white/10 dark:border-white/5 border-t border-l border-white/40 dark:border-t-white/20 dark:border-l-white/20 border-b border-r border-black/5 dark:border-b-white/5 dark:border-r-white/5 rounded-[2.5rem] overflow-hidden bg-white/20 dark:bg-black/10 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.03)] dark:shadow-none relative">
          <div className="col-span-1 border-r border-zinc-200/30 dark:border-white/10">
            <div className="h-12 border-b border-zinc-200/30 dark:border-white/10" />
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex items-start justify-end pr-2 pt-1"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {`${String(hour).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const dayStr = getArgentinaDateKey(day);
            const dayAppointments = appointmentsByDay.get(dayStr) || [];
            const dayLayout = dayLayouts.get(dayStr) || new Map();

            return (
              <div
                key={dayStr}
                className="col-span-1 border-r border-zinc-200/30 dark:border-white/10 last:border-r-0 flex flex-col"
              >
                <div
                  className={`h-12 border-b border-zinc-200/30 dark:border-white/10 flex flex-col items-center justify-center shrink-0 ${
                    isToday(day) ? "bg-violet-200/40 dark:bg-violet-800/30" : ""
                  }`}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      isToday(day) ? "text-violet-700 dark:text-violet-300" : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {(() => {
                  const gridAppts = dayAppointments.filter(
                    a => parseInt(a.start_hhmm) >= GRID_START_HOUR
                  );
                  const earlyAppts = dayAppointments.filter(
                    a => parseInt(a.start_hhmm) < GRID_START_HOUR
                  );

                  return (
                    <>
                      {earlyAppts.length > 0 && (
                        <div className="sticky top-0 z-20 bg-amber-100/40 dark:bg-amber-950/40 backdrop-blur-xl border-b border-amber-200/30 dark:border-amber-800/30 px-2 py-1.5 space-y-1">
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                            ⏰ Fuera de hora
                          </span>
                          {earlyAppts.map((ea) => (
                            <div
                              key={ea.id}
                              className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-200 truncate cursor-pointer"
                              onClick={() => onAppointmentClick(ea)}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span className="font-medium truncate">
                                {ea.customers?.name || "Sin cliente"}
                              </span>
                              <span className="shrink-0 opacity-70">
                                {ea.start_hhmm}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        className="relative flex-1"
                        style={{ minHeight: `${hours.length * HOUR_HEIGHT}px` }}
                      >
                        {hours.map((hour) => (
                          <div
                            key={hour}
                            className="border-b border-zinc-200/30 dark:border-white/[0.03] last:border-b-0 hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer transition-colors"
                            style={{ height: `${HOUR_HEIGHT}px` }}
                            onClick={() => onSlotClick(day, hour)}
                          />
                        ))}

                        {gridAppts.map((appt) => {
                    const durationMinutes = appt.duration_minutes_ar;
                    const topOffset = getTopOffset(appt.start_hhmm);
                    const height = Math.max(
                      (durationMinutes / 60) * HOUR_HEIGHT,
                      28
                    );

                    const pos = dayLayout.get(appt.id) || {
                      width: 100,
                      left: 0,
                    };

                    const staffColor = appt.staff
                      ? staffColorMap.get(appt.staff_id || "") || STAFF_COLORS[0]
                      : STAFF_COLORS[0];

                    const svc = appt.services?.name
                      ? extractEmoji(appt.services.name)
                      : { emoji: "", label: "" };

                    const statusStyle = STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled;
                    const isFinalStatus = STATUS_FINAL.has(appt.status);
                    const diffMs = new Date(appt.start_time).getTime() - Date.now();
                    const isUrgent = appt.status === "scheduled" && diffMs > 0 && diffMs <= 3600000;

                    return (
                      <motion.div
                        key={appt.id}
                        className={`absolute rounded-2xl px-2.5 py-2 text-xs cursor-pointer overflow-hidden flex flex-col font-sans bg-white/30 dark:bg-white/10 backdrop-blur-md border border-white/40 shadow-sm ${isFinalStatus ? "opacity-50" : ""} ${isUrgent ? "animate-pulse-border" : ""}`}
                        style={{
                          top: `${topOffset}px`,
                          height: `${height}px`,
                          width: `calc(${pos.width}% - 4px)`,
                          left: `calc(${pos.left}% + 2px)`,
                          borderLeft: `3px solid ${staffColor.border}`,
                          zIndex: 10,
                        }}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", ...MOTION_PRESET.pill }}
                        whileHover={{ y: -2, scale: 1.02, boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)" }}
                        whileTap={{ scale: 0.985 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAppointmentClick(appt);
                        }}
                        onMouseEnter={(e) => {
                          const pos = { x: e.clientX, y: e.clientY };
                          const adjusted = getTooltipPosition(pos.x, pos.y);
                          tooltipTargetX.set(adjusted.left);
                          tooltipTargetY.set(adjusted.top);
                          setHoverTooltip({ appointment: appt });
                        }}
                        onMouseMove={(e) => {
                          const adjusted = getTooltipPosition(e.clientX, e.clientY);
                          tooltipTargetX.set(adjusted.left);
                          tooltipTargetY.set(adjusted.top);
                        }}
                        onMouseLeave={() => {
                          setHoverTooltip(null);
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl pointer-events-none" />
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 leading-tight min-w-0 truncate">
                            {appt.customers?.name || "Sin cliente"}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {svc.emoji && (
                              <span className="text-sm leading-none">{svc.emoji}</span>
                            )}
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUrgent ? "animate-pulse" : ""}`}
                              style={{ backgroundColor: isUrgent ? "#ef4444" : statusStyle.dot }}
                            />
                          </div>
                        </div>
                        <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate leading-tight mt-0.5">
                          {appt.start_hhmm} - {appt.end_hhmm}
                        </span>
                        {appt.staff?.name && !appt.customers?.name && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
                            {appt.staff.name}
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </>
            );
          })()}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {hoverTooltip && (() => {
          const tipAppt = hoverTooltip.appointment;
          const humanDate = format(new Date(tipAppt.start_local_iso), "EEEE d MMMM", { locale: es });
          return (
            <motion.div
              key={tipAppt.id}
              className="fixed left-0 top-0 pointer-events-none z-[60] w-[300px] rounded-3xl border border-white/40 bg-white/70 dark:bg-black/50 shadow-2xl shadow-black/10 backdrop-blur-2xl px-4 py-3 text-gray-900 dark:text-white"
              style={{ x: tooltipX, y: tooltipY }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", ...MOTION_PRESET.tooltipInOut }}
            >
              <div className="text-base font-semibold leading-tight">
                👤 {tipAppt.customers?.name || "Sin cliente"}
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
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap gap-3 text-xs bg-white/30 dark:bg-black/20 backdrop-blur-2xl rounded-2xl px-4 py-3 border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-sm">
        {staffList && staffList.length > 0 && (
          <div className="flex items-center gap-3 mr-4 flex-wrap">
            {staffList.map((s, i) => {
              const color = STAFF_COLORS[i % STAFF_COLORS.length];
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: color.border }}
                  />
                  <span className="text-gray-600 dark:text-gray-400">{s.name}</span>
                </div>
              );
            })}
            <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
          </div>
        )}
        {Object.entries(statusLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
