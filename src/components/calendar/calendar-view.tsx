"use client";

import { format, startOfWeek, addDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Pointer, X, ExternalLink, Phone } from "lucide-react";
import { AnimatePresence, motion, useAnimation } from "framer-motion";
import { useRef, useState, useEffect, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useHotkey } from "@/lib/use-hotkey";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { GRID_END_HOUR, GRID_START_HOUR, HOUR_HEIGHT } from "@/lib/calendar-constants";
import ContextMenu from "@/components/ui/context-menu";
import type { ContextMenuItem } from "@/components/ui/context-menu";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp/whatsapp-constants";
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
  custom_service_name: string | null;
  custom_service_duration: number | null;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  was_pending_payment?: boolean;
  loyalty_reward_applied?: boolean;
  deposit_amount?: number | null;
  recurring_group_id: string | null;
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
  serviceIds: string[];
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
  onViewModeChange?: (mode: "week" | "day" | "month") => void;
  onBatchClick?: () => void;
  onMonthChange?: (newDate: Date) => void;
  initialViewMode?: "week" | "day" | "month";
  onMoveAppointment?: (appointmentId: string, newStartIso: string) => void;
  autoCompleteEnabled?: boolean;
  onToggleAutoComplete?: () => void;
  canToggleAutoComplete?: boolean;
}

function hourFromHHmm(v: string): number {
  const [h] = v.split(":").map(Number);
  return Number.isFinite(h) ? h : 0;
}

type StaffColor = {
  accent: string;
};

const STAFF_COLORS: StaffColor[] = [
  { accent: "rgba(99,102,241,0.35)" },
  { accent: "rgba(14,165,233,0.35)" },
  { accent: "rgba(234,179,8,0.35)" },
  { accent: "rgba(236,72,153,0.35)" },
  { accent: "rgba(16,185,129,0.35)" },
  { accent: "rgba(168,85,247,0.35)" },
  { accent: "rgba(249,115,22,0.35)" },
  { accent: "rgba(239,68,68,0.35)" },
];

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

function HourDroppable({ hour, dayStr, isOpenSlot, onSlotClick, mobileLabel, showGuides, activeSnap }: {
  hour: number;
  dayStr: string;
  isOpenSlot: boolean;
  onSlotClick: (date: Date, hour: number) => void;
  mobileLabel?: string;
  showGuides: boolean;
  activeSnap: { dayStr: string; hour: number; frac: number } | null;
}) {
  const droppableId = `slot-${dayStr}-${hour}`;
  const { setNodeRef } = useDroppable({
    id: droppableId,
    data: { dayStr, hour },
  });
  return (
    <div
      ref={setNodeRef}
      data-droppable-id={droppableId}
      className={`relative overflow-visible border-b border-zinc-200/30 dark:border-zinc-800/40 last:border-b-0 transition-colors p-1.5 ${
        isOpenSlot
          ? "hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          : "bg-zinc-100/70 dark:bg-zinc-800/50 closed-slot-pattern"
      }`}
      onClick={isOpenSlot ? () => onSlotClick(new Date(`${dayStr}T12:00:00`), hour) : undefined}
    >
      {[0, 0.25, 0.5, 0.75].map((frac) => {
        const isActive = showGuides && activeSnap?.dayStr === dayStr && activeSnap.hour === hour && activeSnap.frac === frac;
        return (
          <div
            key={frac}
            className={`absolute pointer-events-none transition-all duration-200 ${
              isActive
                ? "-left-2.5 -right-2.5 h-[2px] rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)] z-10"
                : "h-px bg-transparent"
            }`}
            style={{ top: `${frac * 100}%` }}
          />
        );
      })}
      {mobileLabel && (
        <span className="absolute left-1 top-1 text-[8px] font-medium text-gray-500 dark:text-gray-400 select-none pointer-events-none">
          {mobileLabel}
        </span>
      )}
    </div>
  );
}

const DAY_MAP: Record<number, string> = {
  0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
  4: "thursday", 5: "friday", 6: "saturday",
};

function getTooltipPosition(x: number, y: number): { left: number; top: number } {
  const offset = 12;
  const tooltipWidth = 270;
  const tooltipHeight = 220;
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
  staffColorMap,
  isCoarsePointer,
  onTooltipMove,
  gridStartHour,
  onHover,
  onLeave,
  onAppointmentClick,
  onContextMenu,
}: {
  appt: NormalizedAppointment;
  startMin: number;
  durationMin: number;
  col: number;
  cols: number;
  viewMode: "week" | "day" | "month";
  staffColorMap: Record<string, (typeof STAFF_COLORS)[0]>;
  isCoarsePointer: boolean;
  onTooltipMove: (left: number, top: number) => void;
  gridStartHour: number;
  onHover: (appt: NormalizedAppointment) => void;
  onLeave: () => void;
  onAppointmentClick: (appt: Appointment | null) => void;
  onContextMenu?: (appt: NormalizedAppointment, e: React.MouseEvent) => void;
}) {
  const staffColor = appt.staff
    ? staffColorMap[appt.staff_id || ""] || STAFF_COLORS[0]
    : STAFF_COLORS[0];

  const svcName = appt.services?.name || appt.custom_service_name || "";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `appt-${appt.id}`,
    data: {
      appointmentId: appt.id,
      startMin,
      customerName: appt.customers?.nombre || "Sin cliente",
      startHhmm: appt.start_hhmm,
      serviceName: svcName,
      accent: staffColor.accent,
      fromMonth: false,
    },
  });
  const isWeekMode = viewMode === "week";
  const isCompact = cols >= 3 || durationMin <= 45;
  const topPx = ((startMin - gridStartHour * 60) / 60) * HOUR_HEIGHT;
  const heightPx = (durationMin / 60) * HOUR_HEIGHT;
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;

  const isCancelled = appt.status === "cancelled";
  const isNoShow = appt.status === "no_show";
  const isCompleted = appt.status === "completed";
  const isConfirmed = appt.status === "confirmed" || appt.status === "in_progress";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-appt-id={appt.id}
      className={`absolute no-native-callout pointer-events-auto min-w-0 cursor-hand-open bg-white dark:bg-zinc-800/90 border border-zinc-200/50 dark:border-zinc-700/50 group overflow-hidden ${isCancelled ? "opacity-0 pointer-events-none" : isCompleted ? "opacity-55" : isNoShow ? "opacity-40" : ""} ${isDragging ? "opacity-30 ring-2 ring-sky-400" : ""}`}
      style={{
        top: `${topPx}px`,
        height: `${Math.max(heightPx - 2, 18)}px`,
        width: `calc(${widthPct}% - 12px)`,
        left: `calc(${leftPct}% + 8px)`,
        fontFamily: "Inter, sans-serif",
        borderLeft: isCancelled
          ? undefined
          : `3px solid ${staffColor.accent}`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) onAppointmentClick(appt);
      }}
      onMouseEnter={(e) => {
        if (isCoarsePointer) return;
        onHover(appt);
        onTooltipMove(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => {
        if (isCoarsePointer) return;
        onTooltipMove(e.clientX, e.clientY);
      }}
      onMouseLeave={onLeave}
      onContextMenu={(e) => onContextMenu?.(appt, e)}
    >
      <div className={`relative z-10 flex h-full ${isWeekMode ? "flex-col p-1 gap-0.5" : "flex-col justify-between p-1.5 gap-0.5"}`}>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 flex items-center gap-1">
              <span className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${isCancelled ? "bg-transparent" : isCompleted ? "bg-emerald-500" : isConfirmed ? "bg-sky-500" : isNoShow ? "bg-zinc-300" : "bg-amber-400"}`} />
              <span className={`font-medium leading-tight truncate ${isWeekMode ? "text-[11px]" : isCompact ? "text-[12px]" : "text-[13px]"} ${isCancelled ? "line-through" : ""} text-gray-800 dark:text-gray-100`}>
                {isWeekMode ? (appt.customers?.nombre?.split(/\s+/)[0] || "Sin") : (appt.customers?.nombre || "Sin cliente")}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {appt.start_hhmm && (
                <span className={`tabular-nums leading-none ${isWeekMode ? "text-[10px] text-gray-400 dark:text-gray-500" : "text-[11px] text-gray-400 dark:text-gray-500"}`}>{appt.start_hhmm}</span>
              )}

            </div>
          </div>
          {svcName && (
            <div className={`flex items-center gap-1.5 leading-tight min-w-0 ${isWeekMode ? "text-[10px] text-gray-500 dark:text-gray-400" : "text-[11px] text-gray-500 dark:text-gray-400"}`}>
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

function MonthAppointmentBlock({
  appt,
  staffColorMap,
  onAppointmentClick,
  onContextMenu,
}: {
  appt: NormalizedAppointment;
  staffColorMap: Record<string, (typeof STAFF_COLORS)[0]>;
  onAppointmentClick: (appt: Appointment | null) => void;
  onContextMenu?: (appt: NormalizedAppointment, e: React.MouseEvent) => void;
}) {
  const isCancelled = appt.status === "cancelled" || appt.status === "no_show";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `m-appt-${appt.id}`,
    data: {
      appointmentId: appt.id,
      startMin: minutesFromHHmm(appt.start_hhmm),
      customerName: appt.customers?.nombre || "Sin cliente",
      startHhmm: appt.start_hhmm,
      serviceName: "",
      accent: (appt.staff_id ? staffColorMap[appt.staff_id]?.accent : undefined) || "#8B5CF6",
      fromMonth: true,
    },
  });
  const staffColor = appt.staff_id ? staffColorMap[appt.staff_id] : undefined;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`text-[11px] font-medium leading-tight truncate rounded px-1.5 py-[3px] cursor-hand-open select-none text-white ${isCancelled ? "opacity-0 pointer-events-none" : ""} ${isDragging ? "opacity-30" : "hover:opacity-80"}`}
      style={{
        backgroundColor: staffColor?.accent || "#8B5CF6",
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) onAppointmentClick(appt);
      }}
      onContextMenu={(e) => onContextMenu?.(appt, e)}
    >
      {appt.start_hhmm} {appt.customers?.nombre?.split(/\s+/)[0] || "Sin"}
      {appt.was_pending_payment && (
        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-white/90 shadow-sm" title="Falta cobrar" />
      )}
    </div>
  );
}

function MonthCell({
  cell,
  count,
  intensity,
  isCurrentMonth,
  isTodayCell,
  appointments,
  maxVisible = 3,
  staffColorMap,
  onAppointmentClick,
  onContextMenu,
  onCellClick,
}: {
  cell: { dateKey: string; day: number; date: Date; isCurrentMonth: boolean };
  count: number;
  intensity: number;
  isCurrentMonth: boolean;
  isTodayCell: boolean;
  appointments: NormalizedAppointment[];
  maxVisible?: number;
  staffColorMap: Record<string, (typeof STAFF_COLORS)[0]>;
  onAppointmentClick: (appt: Appointment | null) => void;
  onContextMenu: (appt: NormalizedAppointment, e: React.MouseEvent) => void;
  onCellClick: (dateKey: string, el: HTMLElement) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `month-cell-${cell.dateKey}`,
    data: { dayStr: cell.dateKey },
  });
  const visible = appointments.slice(0, maxVisible);
  const remaining = appointments.length - visible.length;
  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[80px] border-r border-b border-zinc-200/30 dark:border-zinc-800/30 cursor-pointer hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-colors ${!isCurrentMonth ? "bg-zinc-50/40 dark:bg-zinc-900/30" : ""} ${isTodayCell ? "ring-1 ring-inset ring-sky-400 dark:ring-sky-500" : ""} ${isOver ? "ring-2 ring-sky-400/70 ring-inset bg-sky-100/60 dark:bg-sky-900/40" : ""}`}
      style={{
        backgroundColor: count > 0 && !isOver
          ? `rgba(139, 92, 246, ${(0.08 + intensity * 0.35).toFixed(3)})`
          : undefined,
      }}
      onClick={(e) => onCellClick(cell.dateKey, e.currentTarget)}
    >
      <span className="block mt-1 ml-1.5 mb-0.5 text-xs font-medium">
        {isTodayCell ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold shadow-sm">
            {cell.day}
          </span>
        ) : (
          <span className={`${!isCurrentMonth ? "text-zinc-300 dark:text-zinc-600" : "text-gray-700 dark:text-gray-300"}`}>
            {cell.day}
          </span>
        )}
      </span>
      <div className="px-1 space-y-0.5">
        {visible.map((appt) => (
          <MonthAppointmentBlock
            key={appt.id}
            appt={appt}
            staffColorMap={staffColorMap}
            onAppointmentClick={onAppointmentClick}
            onContextMenu={onContextMenu}
          />
        ))}
        {remaining > 0 && (
          <div className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 truncate px-1">
            +{remaining} más
          </div>
        )}
      </div>
    </div>
  );
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
  onViewModeChange,
  onBatchClick,
  initialViewMode,
  onMoveAppointment,
  onMonthChange,
  autoCompleteEnabled = false,
  onToggleAutoComplete,
  canToggleAutoComplete = false,
}: CalendarViewProps) {
  const { weekStart, weekEnd, weekDays } = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    const we = addDays(ws, 6);
    const wd = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    return { weekStart: ws, weekEnd: we, weekDays: wd };
  }, [currentDate]);
  const [viewMode, _setViewMode] = useState<"week" | "day" | "month">(
    initialViewMode === "day" || initialViewMode === "month" ? initialViewMode : "week"
  );
  const [focusedDayKey, setFocusedDayKey] = useState(() => getArgentinaDateKey(new Date()));
  const setViewMode = useCallback((mode: "week" | "day" | "month") => {
    _setViewMode(mode);
    onViewModeChange?.(mode);
  }, [onViewModeChange]);
  const [mounted, setMounted] = useState(false);
  const [showViewHint, setShowViewHint] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ left: -9999, top: -9999 });
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuAppt, setContextMenuAppt] = useState<NormalizedAppointment | null>(null);
  const portalReady = true;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleTooltipMove = useCallback((clientX: number, clientY: number) => {
    setTooltipPos(getTooltipPosition(clientX, clientY));
  }, []);
  const handleAppointmentHover = useCallback((appt: NormalizedAppointment) => {
    setHoverTooltip({ appointment: appt });
  }, []);
  const handleAppointmentLeave = useCallback(() => {
    setHoverTooltip(null);
  }, []);
  const handleContextMenu = useCallback((appt: NormalizedAppointment, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCoarsePointer) return;
    setContextMenuAppt(appt);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, [isCoarsePointer]);
  const handleCloseContextMenu = useCallback(() => {
    setContextMenuPos(null);
    setContextMenuAppt(null);
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

    return Array.from(byId.values())
      .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
      .map((a) => {
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
          serviceIds: a.service_id ? [a.service_id] : [],
        };
      });
  }, [filteredAppointments]);

  const [activeDragInfo, setActiveDragInfo] = useState<{
    customerName: string;
    startHhmm: string;
    targetTime?: string;
    accent: string;
    serviceName: string;
    fromMonth: boolean;
  } | null>(null);
  const [activeSnap, setActiveSnap] = useState<{ dayStr: string; hour: number; frac: number } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 350,
        tolerance: 8,
      },
    })
  );

  const pointerPosRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { pointerPosRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Distancia vertical entre el puntero y el borde superior del turno agarrado
  const grabOffsetYRef = useRef(0);

  const processedDropRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      document.body.classList.remove("calendar-grabbing");
    },
    []
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    processedDropRef.current = null;
    const data = event.active.data.current as {
      appointmentId?: string;
      startMin?: number;
      customerName?: string;
      startHhmm?: string;
      serviceName?: string;
      accent?: string;
      fromMonth?: boolean;
    } | undefined;
    if (!data?.appointmentId) return;
    document.body.classList.add("calendar-grabbing");
    setActiveSnap(null);
    const apptEl = document.querySelector(`[data-appt-id="${CSS.escape(data.appointmentId)}"]`);
    if (apptEl) {
      const r = apptEl.getBoundingClientRect();
      grabOffsetYRef.current = Math.min(Math.max(pointerPosRef.current.y - r.top, 0), r.height);
    } else {
      const startRect = event.active.rect.current.initial;
      grabOffsetYRef.current = startRect
        ? Math.min(Math.max(pointerPosRef.current.y - startRect.top, 0), startRect.height)
        : 0;
    }
    setActiveDragInfo({
      customerName: data.customerName || "Sin cliente",
      startHhmm: data.startHhmm || "",
      accent: data.accent || "#8B5CF6",
      serviceName: data.serviceName || "",
      fromMonth: !!data.fromMonth,
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    document.body.classList.remove("calendar-grabbing");
    setActiveDragInfo(null);
    setActiveSnap(null);
    if (!over || !onMoveAppointment) return;

    const activeData = active.data.current as { appointmentId?: string; startMin?: number } | undefined;
    const overData = over.data.current as { dayStr?: string; hour?: number } | undefined;
    if (!activeData?.appointmentId || !overData?.dayStr) return;

    if (processedDropRef.current === activeData.appointmentId) return;
    processedDropRef.current = activeData.appointmentId;

    let totalMinutes: number;
    if (overData.hour !== undefined) {
      const droppableEl = document.querySelector(`[data-droppable-id="slot-${overData.dayStr}-${overData.hour}"]`);
      let offsetMinutes = 0;
      if (droppableEl) {
        const rect = droppableEl.getBoundingClientRect();
        const topEdgeY = pointerPosRef.current.y - grabOffsetYRef.current;
        const offsetY = topEdgeY - rect.top;
        offsetMinutes = Math.round((offsetY / HOUR_HEIGHT) * 60 / 15) * 15;
      }
      totalMinutes = overData.hour * 60 + offsetMinutes;
    } else {
      totalMinutes = activeData.startMin ?? (GRID_START_HOUR * 60);
    }
    totalMinutes = Math.min(Math.max(totalMinutes, GRID_START_HOUR * 60), GRID_END_HOUR * 60);

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const arDateStr = `${overData.dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`;
    const utcIso = new Date(arDateStr).toISOString();

    onMoveAppointment(activeData.appointmentId, utcIso);
  }, [onMoveAppointment]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { over } = event;
    if (!over) return;

    const overData = over.data.current as { dayStr?: string; hour?: number } | undefined;
    if (!overData?.dayStr || overData.hour === undefined) return;

    const droppableId = `slot-${overData.dayStr}-${overData.hour}`;
    const droppableEl = document.querySelector(`[data-droppable-id="${droppableId}"]`);
    let offsetMinutes = 0;
    if (droppableEl) {
      const rect = droppableEl.getBoundingClientRect();
      const topEdgeY = pointerPosRef.current.y - grabOffsetYRef.current;
      const offsetY = topEdgeY - rect.top;
      offsetMinutes = Math.round((offsetY / HOUR_HEIGHT) * 60 / 15) * 15;
    }

    let totalMinutes = overData.hour * 60 + offsetMinutes;
    totalMinutes = Math.min(Math.max(totalMinutes, GRID_START_HOUR * 60), GRID_END_HOUR * 60);

    const guideHour = Math.floor(totalMinutes / 60);
    setActiveSnap({ dayStr: overData.dayStr, hour: guideHour, frac: (totalMinutes % 60) / 60 });

    const h = guideHour;
    const m = totalMinutes % 60;
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    setActiveDragInfo((prev) => prev ? { ...prev, targetTime: timeStr } : null);
  }, []);

  const handleDragCancel = useCallback(() => {
    document.body.classList.remove("calendar-grabbing");
    setActiveDragInfo(null);
    setActiveSnap(null);
  }, []);

  const staffColorMap = useMemo(() => {
    const map: Record<string, (typeof STAFF_COLORS)[0]> = {};
    if (!staffList) return map;
    staffList.forEach((s, i) => {
      map[s.id] = STAFF_COLORS[i % STAFF_COLORS.length];
    });
    return map;
  }, [staffList]);

  const mergedAppointments = useMemo(() => {
    if (normalizedAppointments.length === 0) return [];

    const sorted = [...normalizedAppointments].sort((a, b) =>
      a.start_local_iso.localeCompare(b.start_local_iso)
    );

    const merged: NormalizedAppointment[] = [];
    let current: NormalizedAppointment | null = null;

    for (const appt of sorted) {
      if (!current) {
        current = { ...appt };
        continue;
      }

      const currentEnd = new Date(current.end_time).getTime();
      const nextStart = new Date(appt.start_time).getTime();
      const gap = nextStart - currentEnd;

      const sameCustomer = current.customer_id === appt.customer_id;
      const sameStaff = current.staff_id === appt.staff_id;
      const consecutive = Math.abs(gap) <= 120000;
      const sameDay = current.date_key_ar === appt.date_key_ar;

      if (sameCustomer && sameStaff && consecutive && sameDay) {
        const cancelledFlag: boolean = current.status === "cancelled" || appt.status === "cancelled";
        const currentName: string = current.status === "cancelled" ? "" : (current.services?.name || current.custom_service_name || "");
        const nextName: string = appt.status === "cancelled" ? "" : (appt.services?.name || appt.custom_service_name || "");
        const mergedName: string = currentName && nextName
          ? `${currentName} + ${nextName}`
          : currentName || nextName;
        const mergedPrice: number = (current.services?.price ?? 0) + (appt.services?.price ?? 0);
        const mergedDuration: number = (current.services?.duration_minutes ?? 0) + (appt.services?.duration_minutes ?? 0);
        const startMinutes: number = minutesFromHHmm(current.start_hhmm);
        const endMinutes: number = minutesFromHHmm(appt.end_hhmm);
        const sameCalendarDay: boolean = getArgentinaDateKey(current.start_local_iso) === getArgentinaDateKey(appt.end_local_iso);
        const mergedDurationAr: number = sameCalendarDay
          ? Math.max(endMinutes - startMinutes, 1)
          : Math.max((24 * 60 - startMinutes) + endMinutes, 1);

        current = {
          ...current,
          end_time: appt.end_time,
          end_local_iso: appt.end_local_iso,
          end_hhmm: appt.end_hhmm,
          status: cancelledFlag ? "cancelled" : current.status,
          service_id: `${current.service_id},${appt.service_id}`,
          serviceIds: [...current.serviceIds, ...appt.serviceIds],
          services: {
            name: mergedName,
            price: mergedPrice,
            duration_minutes: mergedDuration,
          },
          duration_minutes_ar: mergedDurationAr,
        };
      } else {
        merged.push(current);
        current = { ...appt };
      }
    }
    if (current) merged.push(current);

    return merged;
  }, [normalizedAppointments]);

  const appointmentsByDay = useMemo(() => {
    const keys = new Set<string>();
    for (const day of weekDays) keys.add(getArgentinaDateKey(day));
    for (const appt of mergedAppointments) keys.add(appt.date_key_ar);
    const map = new Map<string, NormalizedAppointment[]>();
    for (const key of keys) map.set(key, []);
    for (const appt of mergedAppointments) {
      map.get(appt.date_key_ar)?.push(appt);
    }
    for (const [, value] of map) {
      value.sort((a, b) => a.start_hhmm.localeCompare(b.start_hhmm));
    }
    return map;
  }, [mergedAppointments, weekDays]);

  const [monthOffset, setMonthOffset] = useState(0);

  const monthDate = useMemo(() => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [currentDate, monthOffset]);

  const prevMonthKeyRef = useRef("");
  useEffect(() => {
    const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    if (prevMonthKeyRef.current && prevMonthKeyRef.current !== key) {
      onMonthChange?.(new Date(monthDate));
    }
    prevMonthKeyRef.current = key;
  }, [monthDate, onMonthChange]);

  const monthCells = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow = firstDay.getDay();
    const startCol = startDow === 0 ? 6 : startDow - 1;

    const cells: Array<{ day: number; date: Date; dateKey: string; isCurrentMonth: boolean }> = [];

    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = 0; i < startCol; i++) {
      const d = prevMonthDays - startCol + 1 + i;
      const date = new Date(year, month - 1, d);
      cells.push({ day: d, date, dateKey: getArgentinaDateKey(date), isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({ day: d, date, dateKey: getArgentinaDateKey(date), isCurrentMonth: true });
    }

    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      cells.push({ day: d, date, dateKey: getArgentinaDateKey(date), isCurrentMonth: false });
    }

    return cells;
  }, [monthDate]);

  const appointmentCountByDateKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const appt of mergedAppointments) {
      map.set(appt.date_key_ar, (map.get(appt.date_key_ar) || 0) + 1);
    }
    return map;
  }, [mergedAppointments]);

  const [selectedDayPopover, setSelectedDayPopover] = useState<{
    dateKey: string;
    el: HTMLElement;
  } | null>(null);

  const pillControls = useAnimation();
  const pillModes = useMemo(() => ["month", "week", "day"] as const, []);
  const pillAnimIdxRef = useRef(pillModes.indexOf(
    initialViewMode === "day" || initialViewMode === "month" ? initialViewMode : "week"
  ));

  const monthAppointmentsByDateKey = useMemo(() => {
    const map = new Map<string, NormalizedAppointment[]>();
    for (const appt of mergedAppointments) {
      const list = map.get(appt.date_key_ar);
      if (list) list.push(appt);
      else map.set(appt.date_key_ar, [appt]);
    }
    return map;
  }, [mergedAppointments]);

  // Lightweight map for the popover — includes all statuses (cancelled, no_show, etc.)
  const popoverAppointmentsByKey = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of filteredAppointments) {
      const key = getArgentinaDateKey(appt.start_time);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    }
    return map;
  }, [filteredAppointments]);

  const maxCountForMonth = useMemo(() => {
    let max = 0;
    for (const cell of monthCells) {
      const count = appointmentCountByDateKey.get(cell.dateKey) || 0;
      if (count > max) max = count;
    }
    return max || 1;
  }, [monthCells, appointmentCountByDateKey]);

  const displayedDays = useMemo(() => {
    const baseDays = (() => {
      if (viewMode === "week") return weekDays;
      const focus = new Date(`${focusedDayKey}T12:00:00`);
      return Number.isFinite(focus.getTime()) ? [focus] : [weekDays[0]];
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
    setMonthOffset(0);
    if (viewMode === "day") {
      setFocusedDayKey(getArgentinaDateKey(new Date()));
    }
  }

  function handlePrevPeriod() {
    if (viewMode === "month") {
      setMonthOffset((o) => o - 1);
      return;
    }
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
    if (viewMode === "month") {
      setMonthOffset((o) => o + 1);
      return;
    }
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
    const show = setTimeout(() => setShowViewHint(true), 1000);
    const hide = setTimeout(() => setShowViewHint(false), 4000);
    return () => { clearTimeout(show); clearTimeout(hide); };
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
    setViewMode("week");
  }, [mounted, setViewMode]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const todayIdx = displayedDays.findIndex((d) => isToday(d));
    if (todayIdx < 0) return;
    const dayWidth = 140;
    const scrollTarget = todayIdx * dayWidth - (container.clientWidth - dayWidth) / 2;
    container.scrollLeft = Math.max(0, scrollTarget);
  }, [mounted, displayedDays]);

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
        container.style.cursor = "url('/cursors/hand-grab.svg') 15 7, grabbing";
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
      if (container) container.style.cursor = "";
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

  const handleCreateAppointment = useCallback(() => {
    const dateStr = viewMode === "day" && focusedDayKey
      ? focusedDayKey
      : getArgentinaDateKey(new Date());
    const date = new Date(`${dateStr}T12:00:00`);
    const now = new Date();
    const currentHour = now.getHours();
    const hour = Math.max(gridStartHour, Math.min(currentHour, gridEndHour - 1));
    onSlotClick(date, hour);
  }, [viewMode, focusedDayKey, gridStartHour, gridEndHour, onSlotClick]);

  useHotkey("ArrowLeft", (e) => {
    if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
    handlePrevPeriod();
  }, { enabled: viewMode !== "month" });
  useHotkey("ArrowRight", (e) => {
    if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
    handleNextPeriod();
  }, { enabled: viewMode !== "month" });
  useHotkey("T", () => handleTodayClick());
  useHotkey("W", () => setViewMode("week"));
  useHotkey("D", () => setViewMode("day"));
  useHotkey("M", () => setViewMode("month"));
  useHotkey("N", () => handleCreateAppointment());

  const styleTag = useMemo(() => (
    <style>{`
      .closed-slot-pattern {
        background-image: repeating-linear-gradient(
          45deg,
          transparent,
          transparent 6px,
          rgba(0,0,0,0.06) 6px,
          rgba(0,0,0,0.06) 8px
        );
      }
      .dark .closed-slot-pattern {
        background-image: repeating-linear-gradient(
          45deg,
          transparent,
          transparent 6px,
          rgba(255,255,255,0.08) 6px,
          rgba(255,255,255,0.08) 8px
        );
      }
    `}</style>
  ), []);

  function handleDayCellClick(dateKey: string, el: HTMLElement) {
    const appts = mergedAppointments.filter((a) => a.date_key_ar === dateKey);
    if (appts.length === 0 || isCoarsePointer || isMobileViewport) {
      setFocusedDayKey(dateKey);
      setViewMode("day");
      const targetIdx = pillModes.indexOf("day");
      pillAnimIdxRef.current = targetIdx;
      pillControls.start({ x: -targetIdx * 76 });
      return;
    }
    setSelectedDayPopover({ dateKey, el });
  }

  function closeDayPopover() {
    setSelectedDayPopover(null);
  }

  useEffect(() => {
    if (!selectedDayPopover) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDayPopover();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDayPopover]);

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

          <div className="relative w-[76px] h-9 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm select-none">
            <motion.div
              drag="x"
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                document.body.classList.remove("calendar-grabbing");
                const pillWidth = 76;
                const idx = pillAnimIdxRef.current;
                const slotsMoved = Math.round(-info.offset.x / pillWidth);
                const targetIdx = ((idx + slotsMoved) % pillModes.length + pillModes.length) % pillModes.length;
                if (targetIdx !== idx) {
                  setViewMode(pillModes[targetIdx]);
                }
                pillAnimIdxRef.current = targetIdx;
                pillControls.start({ x: -targetIdx * pillWidth });
              }}
              onTap={() => {
                const idx = pillAnimIdxRef.current;
                const targetIdx = (idx + 1) % pillModes.length;
                setViewMode(pillModes[targetIdx]);
                pillAnimIdxRef.current = targetIdx;
                pillControls.start({ x: -targetIdx * 76 });
              }}
              animate={pillControls}
              initial={{ x: -pillModes.indexOf(viewMode) * 76 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              onDragStart={() => document.body.classList.add("calendar-grabbing")}
              className="flex cursor-hand-open"
              style={{ width: 228 }}
            >
              {["Mes", "Semana", "Día"].map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-center w-[76px] h-9 text-xs font-medium text-gray-700 dark:text-gray-200"
                >
                  {label}
                </div>
              ))}
            </motion.div>
          </div>
        </div>
        {canToggleAutoComplete && (
          <button
            type="button"
            role="switch"
            aria-checked={autoCompleteEnabled}
            aria-label="Autocompletar turnos automáticamente"
            title="Al activar, los turnos vencidos se confirman y completan automáticamente"
            onClick={onToggleAutoComplete}
            className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-200/80 dark:border-zinc-700/80 bg-white/60 dark:bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer select-none backdrop-blur-sm"
          >
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                autoCompleteEnabled ? "auto-dot-on" : "bg-zinc-300 dark:bg-zinc-600"
              }`}
            />
            Autocompletar turnos
          </button>
        )}
        <div className="flex items-center gap-2">
          {viewMode === "week" && (
            <button
              type="button"
              onClick={onBatchClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 dark:border-zinc-700/80 bg-white/60 dark:bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer select-none backdrop-blur-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Crear múltiples turnos
            </button>
          )}
          {viewMode !== "month" && (
            <h2 className="text-base font-semibold text-gray-900 dark:text-white hidden sm:block">
            {(() => {
              const f = displayedDays[0];
              if (displayedDays.length === 1) return format(f, "d 'de' MMMM", { locale: es });
              const l = displayedDays[displayedDays.length - 1];
              const sameMonth = f.getMonth() === l.getMonth() && f.getFullYear() === l.getFullYear();
              return sameMonth
                ? `${format(f, "d")}–${format(l, "d 'de' MMMM")}`
                : `${format(f, "d MMM")} – ${format(l, "d MMM")}`;
            })()}
          </h2>
          )}
          {viewMode !== "month" && (
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white sm:hidden">
            {(() => {
              const f = displayedDays[0];
              if (displayedDays.length === 1) return format(f, "d MMM", { locale: es });
              const l = displayedDays[displayedDays.length - 1];
              const sameMonth = f.getMonth() === l.getMonth() && f.getFullYear() === l.getFullYear();
              return sameMonth
                ? `${format(f, "d")}–${format(l, "d MMM")}`
                : `${format(f, "d MMM")} – ${format(l, "d MMM")}`;
            })()}
          </h2>
          )}
          {viewMode === "month" && (
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {format(monthDate, "MMMM 'de' yyyy", { locale: es })}
            </h2>
          )}
        </div>
      </div>

      <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
      {viewMode === "month" ? (
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto scroll-smooth">
          <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-50 dark:bg-zinc-900">
            <div className="grid grid-cols-7 border-b border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-800/20">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                <div key={d} className="text-center py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-r border-zinc-200/30 dark:border-zinc-800/30 last:border-r-0">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((cell, i) => {
                const count = appointmentCountByDateKey.get(cell.dateKey) || 0;
                const intensity = count / maxCountForMonth;
                const isCurrentMonth = cell.isCurrentMonth;
                const isTodayCell = isToday(cell.date);
                const dayAppts = monthAppointmentsByDateKey.get(cell.dateKey) || [];
                return (
                  <MonthCell
                    key={`${cell.dateKey}-${i}`}
                    cell={cell}
                    count={count}
                    intensity={intensity}
                    isCurrentMonth={isCurrentMonth}
                    isTodayCell={isTodayCell}
                    appointments={dayAppts}
                    staffColorMap={staffColorMap}
                    onAppointmentClick={onAppointmentClick}
                    onContextMenu={handleContextMenu}
                    onCellClick={handleDayCellClick}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-auto scroll-smooth"
        >
          <div
            className="grid border border-zinc-200/60 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-50 dark:bg-zinc-900 relative"
            style={{
              willChange: "transform",
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
              <div className="col-span-1 border-r border-zinc-200/50 dark:border-zinc-800">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800" style={{ height: `${slotHeight}px` }} />
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
              return (
                <div
                  key={dayStr}
                  className={`col-span-1 border-r border-zinc-200/50 dark:border-zinc-800 border-l-2 border-l-zinc-200 dark:border-l-zinc-700 last:border-r-0 flex flex-col ${dayFullyClosed ? "opacity-60" : ""} ${isToday(day) ? "bg-sky-50/40 dark:bg-sky-900/15" : ""}`}
                >
                  <div
                    className={`group relative border-b border-zinc-200/50 dark:border-zinc-800 flex flex-col items-center justify-center shrink-0 transition-all duration-200 ${
                      viewMode === "day"
                        ? "bg-sky-100 dark:bg-slate-800 cursor-pointer hover:bg-sky-200 dark:hover:bg-slate-700"
                        : isToday(day)
                          ? "cursor-pointer hover:scale-[1.02]"
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
                    {isToday(day) && (
                      <div className="absolute inset-0 rounded-2xl bg-zinc-50/60 dark:bg-zinc-900/60 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-105 transition-all duration-500 ease-out pointer-events-none -z-10" />
                    )}
                    <span className={`relative z-10 text-[11px] uppercase tracking-wide ${
                      isToday(day) && viewMode !== "day"
                        ? "font-bold text-sky-700 dark:text-sky-300"
                        : "text-gray-500 dark:text-gray-400"
                    }`}>
                      {format(day, "EEE", { locale: es })}
                    </span>
                    <span
                      className={`relative z-10 ${
                        isToday(day) && viewMode !== "day"
                          ? "text-lg font-bold text-sky-600 dark:text-sky-400"
                          : "text-sm font-semibold text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayFullyClosed && (
                      <span className="relative z-10 text-[9px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mt-0.5">Cerrado</span>
                    )}
                    <AnimatePresence>
                      {viewMode === "week" && showViewHint && isToday(day) && (
                        <motion.span
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -2 }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-full border border-zinc-200/70 dark:border-zinc-700/70 bg-white/85 dark:bg-zinc-800/85 px-2 py-0.5 text-[8px] font-medium text-zinc-400 dark:text-zinc-500 shadow-xs backdrop-blur-sm flex items-center gap-1"
                        >
                          <Pointer className="w-2.5 h-2.5" />
                          {isMobileViewport ? "Tocá aquí" : "Click"} para cambiar vista
                        </motion.span>
                      )}
                    </AnimatePresence>
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
                        <HourDroppable
                          key={hour}
                          hour={hour}
                          dayStr={dayStr}
                          isOpenSlot={isOpenSlot}
                          onSlotClick={onSlotClick}
                          mobileLabel={(isMobileDayMode || (isMobileViewport && viewMode === "week" && dayIndex === 0)) ? `${String(hour).padStart(2, "0")}:00` : undefined}
                          showGuides={!!activeDragInfo}
                          activeSnap={activeSnap}
                        />
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
                            staffColorMap={staffColorMap}
                            isCoarsePointer={isCoarsePointer}
                            onTooltipMove={handleTooltipMove}
                            gridStartHour={gridStartHour}
                            onHover={handleAppointmentHover}
                            onLeave={handleAppointmentLeave}
                            onAppointmentClick={onAppointmentClick}
                            onContextMenu={handleContextMenu}
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
      )}
        <DragOverlay dropAnimation={null}>
          {activeDragInfo && (
            <div className="pointer-events-none select-none relative h-full w-full">
              {activeDragInfo.fromMonth ? (
                <div
                  className="flex h-full w-full items-center rounded px-1.5 text-[11px] font-medium leading-tight text-white opacity-90 shadow-xl"
                  style={{ backgroundColor: activeDragInfo.accent }}
                >
                  <span className="truncate">
                    {activeDragInfo.startHhmm} {activeDragInfo.customerName.split(/\s+/)[0]}
                  </span>
                </div>
              ) : (
                <div
                  className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-lg border border-zinc-200/50 bg-white p-1 shadow-xl ring-2 ring-sky-400 dark:bg-zinc-800/90 dark:border-zinc-700/50"
                  style={{ fontFamily: "Inter, sans-serif", borderLeft: `3px solid ${activeDragInfo.accent}` }}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span className="text-[11px] font-medium leading-tight truncate text-gray-800 dark:text-gray-100">
                        {activeDragInfo.customerName}
                      </span>
                    </div>
                    {activeDragInfo.serviceName && (
                      <div className="flex items-center gap-1.5 text-[10px] leading-tight min-w-0 text-gray-500 dark:text-gray-400">
                        <span className="truncate">{activeDragInfo.serviceName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 5, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 26 }}
                className="absolute -top-10 right-0 z-10 whitespace-nowrap rounded-md border border-white/30 bg-sky-600 px-2 py-[3px] text-xs font-bold tabular-nums text-white shadow-lg"
              >
                {activeDragInfo.targetTime ?? activeDragInfo.startHhmm}
              </motion.div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {portalReady && !isCoarsePointer && hoverTooltip && createPortal((() => {
        const tipAppt = hoverTooltip.appointment;
        const tipStaffColor = tipAppt.staff_id && staffColorMap[tipAppt.staff_id]
          ? staffColorMap[tipAppt.staff_id].accent
          : "rgba(99,102,241,0.35)";
        const arDate = new Date(`${tipAppt.date_key_ar}T12:00:00-03:00`);
        const dayName = arDate.toLocaleDateString("es-AR", { weekday: "short", timeZone: "America/Argentina/Buenos_Aires" });
        const dayNum = arDate.toLocaleDateString("es-AR", { day: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
        const monthName = arDate.toLocaleDateString("es-AR", { month: "short", timeZone: "America/Argentina/Buenos_Aires" });
        const solidStaffColor = tipStaffColor.replace(/[\d.]+\)$/, "1)");
        return (
          <div
            key={tipAppt.id}
            className="fixed pointer-events-none z-[60]"
            style={{ left: tooltipPos.left, top: tooltipPos.top }}
          >
            <div
              className="w-[270px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden"
              style={{
                boxShadow: `0 2px 4px rgba(0,0,0,0.02), 0 12px 32px -8px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.08) inset`,
                borderLeft: `3px solid ${tipStaffColor}`,
              }}
            >
              <div className="px-4 pt-[18px] pb-4">
                <div
                  className="text-[17px] font-bold leading-tight text-gray-900 dark:text-white tracking-[-0.02em]"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {tipAppt.customers?.nombre || "Sin cliente"}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                  <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-medium text-zinc-500 dark:text-zinc-400">
                    {dayName} {dayNum} {monthName}
                  </span>
                  <span className="tabular-nums font-medium">{tipAppt.start_hhmm}</span>
                </div>
                <div className="mt-3.5 mb-3.5 h-px bg-gradient-to-r from-zinc-200/80 via-zinc-200/30 to-transparent dark:from-zinc-700/50 dark:via-zinc-700/20" />
                {(tipAppt.services?.name || tipAppt.custom_service_name) && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">Servicio</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ backgroundColor: solidStaffColor }} />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight truncate">
                        {tipAppt.services?.name || tipAppt.custom_service_name}
                      </span>
                    </div>
                  </div>
                )}
                <div className="mt-2.5 flex items-baseline gap-2 text-xs">
                  <span className="text-zinc-400 dark:text-zinc-500 shrink-0">Se encarga</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 shrink-0">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300 truncate">{tipAppt.staff?.name || "Sin asignar"}</span>
                  </div>
                </div>
                {(tipAppt.services?.price != null || (tipAppt.deposit_amount != null && tipAppt.deposit_amount > 0) || tipAppt.was_pending_payment) && (
                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    {tipAppt.was_pending_payment && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500 dark:bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_2px_6px_rgba(244,63,94,0.25)]">
                        Falta cobrar
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </span>
                    )}
                    {tipAppt.services?.price != null && tipAppt.is_paid && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 dark:bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_2px_6px_rgba(16,185,129,0.25)]">
                        ${tipAppt.services.price.toLocaleString("es-AR")}
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                    {tipAppt.services?.price != null && !tipAppt.is_paid && (
                      <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                        ${tipAppt.services.price.toLocaleString("es-AR")}
                      </span>
                    )}
                    {tipAppt.deposit_amount != null && tipAppt.deposit_amount > 0 && (
                      <span className="inline-flex items-center rounded-lg bg-amber-500 dark:bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_2px_6px_rgba(245,158,11,0.25)]">
                        Seña ${tipAppt.deposit_amount.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {selectedDayPopover && portalReady && createPortal((() => {
        const rawDayAppts = popoverAppointmentsByKey.get(selectedDayPopover.dateKey) || [];
        const dayAppts = rawDayAppts.map((a) => ({
          ...a,
          start_hhmm: extractArgentinaTimeHHmm(toArgentinaLocalIsoString(a.start_time)),
          date_key_ar: getArgentinaDateKey(a.start_time),
        })).sort((a, b) => a.start_hhmm.localeCompare(b.start_hhmm));
        const cellRect = selectedDayPopover.el.getBoundingClientRect();
        const POPUP_WIDTH = 280;
        const PAD = 8;
        const popHeight = Math.min(dayAppts.length * 56 + 100, 420);
        let popLeft = cellRect.left + cellRect.width / 2 - POPUP_WIDTH / 2;
        popLeft = Math.max(PAD, Math.min(popLeft, window.innerWidth - POPUP_WIDTH - PAD));
        const spaceBelow = window.innerHeight - cellRect.bottom;
        const spaceAbove = cellRect.top;
        let popTop: number;
        if (spaceBelow >= popHeight + PAD) {
          popTop = cellRect.bottom + 4;
        } else if (spaceAbove >= popHeight + PAD) {
          popTop = cellRect.top - popHeight - 4;
        } else {
          popTop = Math.max(PAD, cellRect.bottom + 4);
        }

        return (
          <>
            <div className="fixed inset-0 z-[70]" onClick={closeDayPopover} />
            <div
              className="fixed z-[71] w-[280px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-700/60 shadow-xl overflow-hidden"
              style={{ left: popLeft, top: popTop, maxHeight: `${popHeight}px` }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {(() => {
                      const d = new Date(`${selectedDayPopover.dateKey}T12:00:00-03:00`);
                      const wd = d.toLocaleDateString("es-AR", { weekday: "long", timeZone: "America/Argentina/Buenos_Aires" });
                      const day = d.toLocaleDateString("es-AR", { day: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
                      const mo = d.toLocaleDateString("es-AR", { month: "long", timeZone: "America/Argentina/Buenos_Aires" });
                      return `${wd} ${day} de ${mo}`;
                    })()}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{dayAppts.length} turno{dayAppts.length !== 1 ? "s" : ""}</p>
                </div>
                <button onClick={closeDayPopover} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: popHeight - 100 }}>
                {dayAppts.map((appt) => (
                  <div
                    key={appt.id}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-zinc-50 dark:border-zinc-800/50 last:border-b-0 cursor-pointer transition-colors ${
                      appt.status === "cancelled"
                        ? "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50"
                        : appt.status === "no_show"
                          ? "bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                          : appt.status === "completed"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
                            : appt.status === "in_progress"
                              ? "bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-950/50"
                              : appt.status === "confirmed"
                                ? "bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                    }`}
                    onClick={() => {
                      closeDayPopover();
                      onAppointmentClick(appt);
                    }}
                  >
                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400 tabular-nums w-10 shrink-0">{appt.start_hhmm}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {appt.customers?.nombre || "Sin cliente"}
                        {appt.was_pending_payment && (
                          <span className="ml-1.5 inline-flex items-center rounded-md bg-rose-100 dark:bg-rose-950/60 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:text-rose-300 align-middle">
                            Falta cobrar
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                        {appt.services?.name || appt.custom_service_name || "Sin servicio"}
                        <span className="mx-1">·</span>
                        {appt.staff?.name || "Sin asignar"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  className="w-full text-center text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors cursor-pointer"
                  onClick={() => {
                    closeDayPopover();
                    setFocusedDayKey(selectedDayPopover.dateKey);
                    setViewMode("day");
                    const targetIdx = pillModes.indexOf("day");
                    pillAnimIdxRef.current = targetIdx;
                    pillControls.start({ x: -targetIdx * 76 });
                  }}
                >
                  Ver día completo →
                </button>
              </div>
            </div>
          </>
        );
      })(), document.body)}

      {businessHours && (
        <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500 select-none">
          <hr className="flex-1 border-t border-zinc-300/60 dark:border-zinc-700/60" />
          <span className="tracking-wider uppercase">Cerrado</span>
          <hr className="flex-1 border-t border-zinc-300/60 dark:border-zinc-700/60" />
        </div>
      )}
      {styleTag}

      <ContextMenu
        items={(() => {
          if (!contextMenuAppt) return [];
          const items: ContextMenuItem[] = [
            {
              label: "Ver detalle",
              icon: <ExternalLink className="w-3.5 h-3.5" />,
              onClick: () => onAppointmentClick(contextMenuAppt),
            },
          ];
          const phone = contextMenuAppt.customers?.telefono;
          if (phone) {
            const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
            const customerName = contextMenuAppt.customers?.nombre || "Cliente";
            const startTime = contextMenuAppt.start_hhmm || "";
            const template = DEFAULT_WHATSAPP_TEMPLATE
              .replace(/@Nombre/g, customerName)
              .replace(/@Hora/g, startTime)
              .replace(/@Lugar/g, "");
            items.push({
              label: "Enviar WhatsApp",
              icon: <Phone className="w-3.5 h-3.5" />,
              onClick: () => window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(template)}`, "_blank"),
            });
          }
          return items;
        })()}
        position={contextMenuPos}
        onClose={handleCloseContextMenu}
      />
    </div>
  );
})
