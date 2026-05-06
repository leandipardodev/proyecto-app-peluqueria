"use client";

import { format, startOfWeek, addDays, isSameDay, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MousePointerClick } from "lucide-react";
import { useRef, useState, useEffect } from "react";

type Appointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  notes: string | null;
  customers: { name: string; email: string; phone: string | null } | null;
  staff: { name: string; email: string } | null;
  services: { name: string; price: number; duration_minutes: number } | null;
};

interface CalendarViewProps {
  appointments: Appointment[];
  currentDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSlotClick: (date: Date, hour: number) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

const hours = (() => {
  const h = [];
  for (let i = 7; i <= 23; i++) h.push(i);
  h.push(0);
  return h;
})();

const HOUR_HEIGHT = 48; // px per hour

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  completed: "bg-gray-100 text-gray-800 border-gray-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-orange-100 text-orange-800 border-orange-200",
};

const statusLabels: Record<string, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

export default function CalendarView({
  appointments,
  currentDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  onSlotClick,
  onAppointmentClick,
}: CalendarViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 640);
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
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
      if (showScrollHint) setShowScrollHint(false);
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
  }, [showScrollHint]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevWeek}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onNextWeek}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="ml-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Hoy
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 hidden sm:block">
          {format(weekStart, "d 'de' MMMM", { locale: es })} —{" "}
          {format(addDays(weekStart, 6), "d 'de' MMMM 'de' yyyy", {
            locale: es,
          })}
        </h2>
        <h2 className="text-sm font-semibold text-gray-900 sm:hidden">
          {format(weekStart, "d MMM", { locale: es })} -{" "}
          {format(addDays(weekStart, 6), "d MMM", { locale: es })}
        </h2>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        <div className="grid grid-cols-8 min-w-[700px] border border-gray-200 rounded-xl overflow-hidden bg-white relative">
          <div className="col-span-1 bg-gray-50 border-r border-gray-200">
            <div className="h-12 border-b border-gray-200" />
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-12 flex items-start justify-end pr-2 pt-1"
              >
                <span className="text-xs text-gray-500">
                  {format(new Date().setHours(hour, 0, 0, 0), "HH:mm")}
                </span>
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const dayAppointments = appointments.filter((a) => {
              const apptDate = new Date(a.start_time);
              return isSameDay(apptDate, day);
            });

            return (
              <div
                key={dayStr}
                className="col-span-1 border-r border-gray-100 last:border-r-0"
              >
                <div
                  className={`h-12 border-b border-gray-200 flex flex-col items-center justify-center ${
                    isToday(day) ? "bg-violet-50" : ""
                  }`}
                >
                  <span className="text-xs text-gray-500 uppercase">
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      isToday(day) ? "text-violet-700" : "text-gray-900"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {hours.map((hour) => {
                  const hourAppointments = dayAppointments.filter((a) => {
                    const apptHour = new Date(a.start_time).getHours();
                    return apptHour === hour;
                  });

                  return (
                    <div
                      key={hour}
                      className="h-12 border-b border-gray-100 last:border-b-0 relative hover:bg-gray-50 cursor-pointer transition-colors min-h-[48px]"
                      onClick={() => onSlotClick(day, hour)}
                    >
                      {hourAppointments.map((appt) => {
                        const start = new Date(appt.start_time);
                        const end = new Date(appt.end_time);
                        const startMin = start.getMinutes();
                        const diffMin =
                          (end.getTime() - start.getTime()) / 60000;
                        const topOffset = (startMin / 60) * HOUR_HEIGHT;
                        const height = Math.max((diffMin / 60) * HOUR_HEIGHT, 24);
                        const colorClass =
                          statusColors[appt.status] ||
                          statusColors.scheduled;

                        return (
                          <div
                            key={appt.id}
                            className={`absolute inset-x-1 rounded-md border px-2 py-1 text-xs cursor-pointer overflow-hidden z-10 hover:shadow-md transition-shadow ${colorClass}`}
                            style={{
                              top: `${topOffset}px`,
                              height: `${height}px`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAppointmentClick(appt);
                            }}
                          >
                            <div className="font-medium truncate">
                              {appt.customers?.name || "Sin cliente"}
                            </div>
                            {height > 36 && (
                              <div className="truncate opacity-80">
                                {appt.services?.name}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(statusLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div
              className={`w-3 h-3 rounded-full ${
                statusColors[key]?.split(" ")[0]
              }`}
            />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
