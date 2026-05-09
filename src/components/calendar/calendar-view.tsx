"use client";

import { format, startOfWeek, addDays, isSameDay, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useEffect, useMemo } from "react";

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
  const h = [];
  for (let i = 7; i <= 23; i++) h.push(i);
  h.push(0);
  return h;
})();

const HOUR_HEIGHT = 48;

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

function computeOverlapLayout(
  dayAppointments: Appointment[]
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

    const group: Appointment[] = [sorted[i]];
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const filteredAppointments = useMemo(() => {
    if (!staffFilter) return appointments;
    return appointments.filter((a) => a.staff_id === staffFilter);
  }, [appointments, staffFilter]);

  const staffColorMap = useMemo(() => {
    const map = new Map<string, typeof STAFF_COLORS[0]>();
    if (!staffList) return map;
    staffList.forEach((s, i) => {
      map.set(s.id, STAFF_COLORS[i % STAFF_COLORS.length]);
    });
    return map;
  }, [staffList]);

  const dayLayouts = useMemo(() => {
    const layouts = new Map<string, Map<string, { width: number; left: number }>>();
    for (const day of weekDays) {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayAppts = filteredAppointments.filter((a) =>
        isSameDay(new Date(a.start_time), day)
      );
      layouts.set(dayStr, computeOverlapLayout(dayAppts));
    }
    return layouts;
  }, [filteredAppointments, weekDays]);

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
            <div className="w-20 h-9 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            <div className="w-20 h-9 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            <div className="w-16 h-9 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse ml-2" />
          </div>
          <div className="w-64 h-6 bg-gray-100 dark:bg-gray-800 rounded animate-pulse hidden sm:block" />
        </div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevWeek}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onNextWeek}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="ml-2 px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
          >
            Hoy
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 hidden sm:block">
          {format(weekStart, "d 'de' MMMM", { locale: es })} —{" "}
          {format(addDays(weekStart, 6), "d 'de' MMMM 'de' yyyy", {
            locale: es,
          })}
        </h2>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:hidden">
          {format(weekStart, "d MMM", { locale: es })} -{" "}
          {format(addDays(weekStart, 6), "d MMM", { locale: es })}
        </h2>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        <div className="grid grid-cols-8 min-w-[700px] border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900 relative transition-colors">
          <div className="col-span-1 bg-gray-50 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700">
            <div className="h-12 border-b border-gray-200 dark:border-gray-700" />
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-12 flex items-start justify-end pr-2 pt-1"
              >
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {format(new Date(2000, 0, 1).setHours(hour, 0, 0, 0), "HH:mm")}
                </span>
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const dayAppointments = filteredAppointments.filter((a) =>
              isSameDay(new Date(a.start_time), day)
            );
            const dayLayout = dayLayouts.get(dayStr) || new Map();

            return (
              <div
                key={dayStr}
                className="col-span-1 border-r border-gray-100 dark:border-gray-800 last:border-r-0 flex flex-col"
              >
                <div
                  className={`h-12 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center shrink-0 ${
                    isToday(day) ? "bg-violet-50 dark:bg-violet-950" : ""
                  }`}
                >
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
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

                <div
                  className="relative flex-1"
                  style={{ minHeight: `${hours.length * HOUR_HEIGHT}px` }}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="h-12 border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => onSlotClick(day, hour)}
                    />
                  ))}

                  {dayAppointments.map((appt) => {
                    const start = new Date(appt.start_time);
                    const end = new Date(appt.end_time);
                    const dayStart = new Date(day);
                    dayStart.setHours(0, 0, 0, 0);
                    const minutesSinceMidnight =
                      (start.getTime() - dayStart.getTime()) / 60000;
                    const durationMinutes =
                      (end.getTime() - start.getTime()) / 60000;
                    const topOffset =
                      (minutesSinceMidnight / 60) * HOUR_HEIGHT;
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
                    const diffMs = start.getTime() - Date.now();
                    const isUrgent = appt.status === "scheduled" && diffMs > 0 && diffMs <= 3600000;

                    const tooltipLines = [
                      appt.customers?.name && `Cliente: ${appt.customers.name}`,
                      svc.label && `Servicio: ${svc.emoji} ${svc.label}`,
                      appt.customers?.email && `Email: ${appt.customers.email}`,
                      appt.staff?.name && `Peluquero: ${appt.staff.name}`,
                    ].filter(Boolean);

                    const timeStr = start.toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={appt.id}
                        title={tooltipLines.join(" | ")}
                        className={`absolute rounded-md px-1.5 py-1 text-xs cursor-pointer overflow-hidden hover:!z-30 transition-all duration-150 hover:scale-105 hover:shadow-lg flex flex-col ${isFinalStatus ? "opacity-60" : ""} ${isUrgent ? "animate-pulse-border" : ""}`}
                        style={{
                          top: `${topOffset}px`,
                          height: `${height}px`,
                          width: `calc(${pos.width}% - 4px)`,
                          left: `calc(${pos.left}% + 2px)`,
                          borderLeft: `4px solid ${staffColor.border}`,
                          borderTop: `1px solid ${statusStyle.border}40`,
                          borderRight: `1px solid ${statusStyle.border}40`,
                          borderBottom: `1px solid ${statusStyle.border}40`,
                          backgroundColor: statusStyle.bg,
                          zIndex: 10,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAppointmentClick(appt);
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-gray-900 leading-tight shrink-0">
                            {timeStr}
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
                        <span
                          className="font-medium truncate leading-tight text-gray-900 min-w-0 mt-0.5"
                          title={appt.customers?.name || "Sin cliente"}
                        >
                          {appt.customers?.name || "Sin cliente"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
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