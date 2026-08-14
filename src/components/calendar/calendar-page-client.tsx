"use client";

import { Component, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { addWeeks, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { RefreshCcw } from "lucide-react";
import { moveAppointmentGroup } from "@/lib/dashboard/appointments/actions";
import { autoCompletePastAppointments } from "@/lib/dashboard/appointments/mutations";
import { toggleAutoComplete } from "@/lib/dashboard/shop/shop-actions";
import { useToast } from "@/components/ui/toast";
import { getUserFriendlyError } from "@/lib/dashboard/appointments/errors";

let realtimeChannelCounter = 0;

class CalendarErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError() {
    return { error: "Ocurrió un error inesperado en el calendario" };
  }
  componentDidCatch(error: Error) {
    console.error("CalendarErrorBoundary caught:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <p className="text-red-500 dark:text-red-400 text-sm">{this.state.error}</p>
            <button
              type="button"
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer select-none"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import CalendarView from "./calendar-view";
import dynamic from "next/dynamic";
const AppointmentFormModal = dynamic(() => import("./appointment-form-modal"), { ssr: false });
const AppointmentDetailModal = dynamic(() => import("./appointment-detail-modal"), { ssr: false });
const BatchAppointmentModal = dynamic(() => import("./batch-appointment-modal"), { ssr: false });
import { StatePanel } from "@/components/ui/state-panel";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { useAutoCompleteAppointments } from "@/lib/use-auto-complete-appointments";
import { getArgentinaDateKey, getArgentinaWeekStart } from "@/lib/argentina-time";
import { supabase } from "@/lib/supabase";
import { fetchAppointments } from "@/lib/dashboard/appointments/query-actions";

function CalendarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-24 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="h-8 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
        </div>
      </div>
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-px mb-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-3">
              <div className="h-3 w-10 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-7 w-7 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
        <div className="h-[500px] lg:h-[600px] bg-white/10 dark:bg-white/[0.03] rounded-2xl" />
      </div>
    </div>
  );
}

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
  deposit_amount?: number | null;
  recurring_group_id: string | null;
  notes: string | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null } | null;
  staff: { name: string | null; email: string | null } | null;
  services: { name: string; price: number; duration_minutes: number } | null;
};

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
};

type StaffMember = {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
};

type Customer = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
};

type BusinessHourEntry = { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null };
type BusinessHoursMap = Record<string, BusinessHourEntry>;

const STAFF_SEGMENTED_COLORS = [
  "#c084fc",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#22d3ee",
  "#fb923c",
  "#818cf8",
  "#f472b6",
];

interface CalendarPageClientProps {
  shopId: string;
  initialAppointments: Appointment[];
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  error?: string | null;
  businessHours?: BusinessHoursMap;
  initialDateParam?: string;
  initialAppointmentId?: string;
  initialViewMode?: string;
  autoCompleteEnabled?: boolean;
  isOwner?: boolean;
}

export default function CalendarPageClient({
  shopId,
  initialAppointments,
  services,
  staff,
  customers,
  error,
  businessHours,
  initialDateParam,
  initialAppointmentId,
  initialViewMode,
  autoCompleteEnabled = false,
  isOwner = false,
}: CalendarPageClientProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(() => {
    if (!initialDateParam) return new Date();
    const parsed = new Date(`${initialDateParam}T12:00:00-03:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>();
  const [formInitialHour, setFormInitialHour] = useState<number | undefined>();
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [staffFilter, setStaffFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [appointments, setAppointments] = useState(initialAppointments);
  const appointmentsRef = useRef(appointments);
  const [hydrated, setHydrated] = useState(false);
  const calendarViewModeRef = useRef<"week" | "day" | "month">("week");
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [autoCompleteOn, setAutoCompleteOn] = useState(autoCompleteEnabled);
  const [togglingAutoComplete, setTogglingAutoComplete] = useState(false);

  const handleToggleAutoComplete = useCallback(async () => {
    if (togglingAutoComplete) return;
    const next = !autoCompleteOn;
    setTogglingAutoComplete(true);
    setAutoCompleteOn(next);
    try {
      const result = await toggleAutoComplete(next);
      if (result.success === false) {
        setAutoCompleteOn(!next);
        addToast(getUserFriendlyError(result.error), "error");
        return;
      }
      addToast(next ? "Autocompletado de turnos activado" : "Autocompletado de turnos desactivado", "success");
      if (next) {
        await autoCompletePastAppointments(shopId);
      }
    } catch (e) {
      setAutoCompleteOn(!next);
      addToast("Error al cambiar el autocompletado", "error");
      console.error("toggleAutoComplete error", e);
    } finally {
      setTogglingAutoComplete(false);
    }
  }, [autoCompleteOn, togglingAutoComplete, shopId, addToast]);

  const [fetchedRangeEnd, setFetchedRangeEnd] = useState(() => {
    const ws = getArgentinaWeekStart();
    const end = new Date(ws);
    end.setUTCDate(ws.getUTCDate() + 90);
    end.setUTCHours(23, 59, 59, 999);
    return end.toISOString();
  });
  const fetchedRangeEndRef = useRef(fetchedRangeEnd);
  useEffect(() => { fetchedRangeEndRef.current = fetchedRangeEnd; }, [fetchedRangeEnd]);

  const initialSynced = useRef(false);
  useEffect(() => {
    if (initialSynced.current) return;
    initialSynced.current = true;
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  const enrichedAppointments = useMemo(() => {
    if (!Array.isArray(appointments) || appointments.length === 0) return [];

    const servicesById = new Map(services.map((service) => [service.id, service]));

    return appointments.map((appointment) => {
      if (appointment.services?.name) return appointment;
      const serviceIds = (appointment as Appointment & { serviceIds?: string[] }).serviceIds?.length
        ? (appointment as Appointment & { serviceIds?: string[] }).serviceIds!
        : appointment.service_id?.includes(",")
          ? appointment.service_id.split(",")
          : [appointment.service_id];
      const matchedServices = serviceIds.map((id) => servicesById.get(id)).filter(Boolean) as typeof services;
      if (matchedServices.length === 0) return appointment;

      const mergedName = matchedServices.map((s) => s.name).join(" + ");
      const mergedPrice = matchedServices.reduce((sum, s) => sum + (s.price ?? 0), 0);
      const mergedDuration = matchedServices.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);

      return {
        ...appointment,
        services: {
          name: mergedName,
          price: mergedPrice,
          duration_minutes: mergedDuration,
        },
      };
    });
  }, [appointments, services]);

  const filteredAppointments = useMemo(() => {
    if (!statusFilter) return enrichedAppointments;
    const statuses = statusFilter === "scheduled"
      ? ["scheduled", "pending_payment"]
      : statusFilter === "confirmed"
        ? ["confirmed", "in_progress"]
        : [statusFilter];
    return enrichedAppointments.filter((a) => statuses.includes(a.status));
  }, [enrichedAppointments, statusFilter]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    if (!initialAppointmentId) return;
    const found = enrichedAppointments.find((a) => a.id === initialAppointmentId);
    if (found) {
      setSelectedAppointment(found);
    }
  }, [initialAppointmentId, enrichedAppointments]);

  useAppointmentAlarm(enrichedAppointments);
  useAutoCompleteAppointments(shopId);

  const realtimeCooldown = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channelId = ++realtimeChannelCounter;

    const weekStart = getArgentinaWeekStart();
    const rangeStart = new Date(weekStart);
    rangeStart.setUTCDate(weekStart.getUTCDate() - 7);

    const handleChange = async () => {
      if (!initialSynced.current || realtimeCooldown.current || pendingMove.current) return;
      realtimeCooldown.current = true;
      setTimeout(() => { realtimeCooldown.current = false; }, 5000);
      try {
        const { data: rows, error } = await supabase
          .from("appointments")
          .select("id, customer_id, staff_id, service_id, start_time, end_time, status, is_paid, was_pending_payment, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, recurring_group_id, notes")
          .eq("shop_id", shopId)
          .gte("start_time", rangeStart.toISOString())
          .lte("start_time", fetchedRangeEndRef.current)
          .order("start_time", { ascending: true });
        if (!error && rows) {
          const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((id): id is string => id !== null))];
          const staffIds = [...new Set(rows.map((r) => r.staff_id).filter((id): id is string => id !== null))];
          const serviceIds = [...new Set(rows.map((r) => r.service_id).filter((id): id is string => id !== null))];
          const [customersRes, staffRes, servicesRes] = await Promise.all([
            customerIds.length > 0
              ? supabase.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds)
              : { data: [] },
            staffIds.length > 0
              ? supabase.from("user_profiles").select("user_id, name, email").in("user_id", staffIds)
              : { data: [] },
            serviceIds.length > 0
              ? supabase.from("services").select("id, name, price, duration_minutes").in("id", serviceIds)
              : { data: [] },
          ]);
          const customersMap = new Map((customersRes.data || []).map((c) => [c.id, { ...c, nombre: c.nombre ?? "", telefono: c.telefono ?? "", loyalty_rewards_available: c.loyalty_rewards_available ?? 0 }]));
          const staffMap = new Map((staffRes.data || []).map((s) => [s.user_id, { ...s, name: s.name ?? "", email: s.email ?? "" }]));
          const servicesMap = new Map((servicesRes.data || []).map((s) => [s.id, { ...s, duration_minutes: s.duration_minutes ?? 0 }]));
          const enriched = rows.map((r) => ({
            ...r,
            customers: customersMap.get(r.customer_id ?? "") ?? null,
            staff: staffMap.get(r.staff_id ?? "") ?? null,
            services: servicesMap.get(r.service_id ?? "") ?? null,
          }));
          setAppointments((prev) => {
            const prevMap = new Map(prev.map(a => [a.id, a]));
            const merged = enriched.map(e => {
              const prevApt = prevMap.get(e.id);
              if (!e.customers && prevApt?.customers) {
                return { ...e, customers: prevApt.customers };
              }
              return e;
            });
            return merged as any;
          });
        }
      } catch (e) {
        console.error("Calendar Realtime: error en handleChange", e);
      }
    };

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`calendar-${shopId}-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `shop_id=eq.${shopId}` }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `shop_id=eq.${shopId}` }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_memberships", filter: `shop_id=eq.${shopId}` }, handleChange)
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Calendar Realtime: channel error: el cliente reconectará automáticamente", err);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [shopId]);

  const handleSlotClick = useCallback((date: Date, hour: number) => {
    setFormInitialDate(getArgentinaDateKey(date));
    setFormInitialHour(hour);
    setFormModalOpen(true);
  }, []);

  const handlePrevWeek = useCallback(() => {
    setCurrentDate((d) => subWeeks(d, 1));
  }, []);

  const handleNextWeek = useCallback(() => {
    setCurrentDate((d) => addWeeks(d, 1));
  }, []);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleAppointmentClick = useCallback((appt: Appointment | null) => {
    setSelectedAppointment(appt);
  }, []);

  const pendingMove = useRef(false);
  const handleMoveAppointment = useCallback(async (appointmentId: string, newStartIso: string) => {
    if (pendingMove.current) return;
    pendingMove.current = true;
    realtimeCooldown.current = true;
    setTimeout(() => { realtimeCooldown.current = false; }, 5000);

    const primaryApt = appointmentsRef.current.find((a) => a.id === appointmentId);
    if (!primaryApt) {
      pendingMove.current = false;
      realtimeCooldown.current = false;
      return;
    }

    const primaryStartMs = new Date(primaryApt.start_time).getTime();
    const offsetMs = new Date(newStartIso).getTime() - primaryStartMs;

    // Find siblings with same logic as server: same customer + staff + date_key_ar, consecutive =2min gap
    const siblingIds: string[] = [];
    const { staff_id: primaryStaffId, customer_id: primaryCustomerId } = primaryApt;
    if (primaryStaffId && primaryCustomerId) {
      const primaryDateKey = getArgentinaDateKey(primaryApt.start_time);
      const sameDay = appointmentsRef.current
        .filter(
          (a) =>
            a.id !== appointmentId &&
            a.customer_id === primaryCustomerId &&
            a.staff_id === primaryStaffId &&
            getArgentinaDateKey(a.start_time) === primaryDateKey &&
            a.status !== "cancelled" && a.status !== "no_show"
        )
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      const combined = [primaryApt, ...sameDay].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
      const primaryIdx = combined.findIndex((r) => r.id === appointmentId);

      for (let i = primaryIdx + 1; i < combined.length; i++) {
        const gap = new Date(combined[i].start_time).getTime() - new Date(combined[i - 1].end_time).getTime();
        if (Math.abs(gap) <= 120000) siblingIds.push(combined[i].id);
        else break;
      }
      for (let i = primaryIdx - 1; i >= 0; i--) {
        const gap = new Date(combined[i + 1].start_time).getTime() - new Date(combined[i].end_time).getTime();
        if (Math.abs(gap) <= 120000) siblingIds.unshift(combined[i].id);
        else break;
      }
    }

    const allMoveIds = [appointmentId, ...siblingIds];

    // Capture current state for rollback
    const movedSnapshot = new Map<string, Appointment>();
    for (const a of appointmentsRef.current) {
      if (allMoveIds.includes(a.id)) movedSnapshot.set(a.id, { ...a });
    }

    // Optimistically move all siblings together
    setAppointments((prev) =>
      prev.map((a) => {
        if (a.id === appointmentId) {
          const newEnd = new Date(new Date(newStartIso).getTime() + (new Date(primaryApt.end_time).getTime() - primaryStartMs)).toISOString();
          return { ...a, start_time: newStartIso, end_time: newEnd };
        }
        if (siblingIds.includes(a.id)) {
          return {
            ...a,
            start_time: new Date(new Date(a.start_time).getTime() + offsetMs).toISOString(),
            end_time: new Date(new Date(a.end_time).getTime() + offsetMs).toISOString(),
          };
        }
        return a;
      })
    );

    const result = await moveAppointmentGroup(appointmentId, newStartIso, shopId);
    if (result.success) {
      const originalStart = primaryApt.start_time;
      addToast("Turno movido correctamente", "success", {
        label: "Deshacer",
        onClick: async () => {
          pendingMove.current = true;
          await moveAppointmentGroup(appointmentId, originalStart, shopId);
          setAppointments((prev) => prev.map((a) => movedSnapshot.has(a.id) ? movedSnapshot.get(a.id)! : a));
          pendingMove.current = false;
        },
      });
    } else {
      // Only restore affected appointments, preserve realtime updates for others
      setAppointments((prev) => prev.map((a) => movedSnapshot.has(a.id) ? movedSnapshot.get(a.id)! : a));
      const msg = getUserFriendlyError(result.error);
      addToast(msg, "error");
    }
    pendingMove.current = false;
  }, [shopId, addToast]);

  const refreshAppointments = useCallback(async (customEnd?: string) => {
    const weekStart = getArgentinaWeekStart();
    const rangeStart = new Date(weekStart);
    rangeStart.setUTCDate(weekStart.getUTCDate() - 7);
    const endStr = customEnd ?? fetchedRangeEndRef.current;
    const result = await fetchAppointments(rangeStart.toISOString(), endStr, shopId);
    if (result.success && Array.isArray(result.data)) {
      setAppointments(result.data as Appointment[]);
    }
  }, [shopId]);

  const handleMonthChange = useCallback(async (newDate: Date) => {
    const monthEnd = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
    monthEnd.setUTCHours(23, 59, 59, 999);
    const buffer = new Date(monthEnd);
    buffer.setUTCDate(buffer.getUTCDate() + 30);
    const newEndStr = buffer.toISOString();

    if (newEndStr <= fetchedRangeEndRef.current) return;

    setFetchedRangeEnd(newEndStr);
    await refreshAppointments(newEndStr);
  }, [refreshAppointments]);

  useEffect(() => {
    function onAppointmentsUpdated() {
      refreshAppointments();
    }
    window.addEventListener("appointments-updated", onAppointmentsUpdated);
    return () => window.removeEventListener("appointments-updated", onAppointmentsUpdated);
  }, [refreshAppointments]);

  if (!hydrated) {
    return <CalendarSkeleton />;
  }

  return (
    <CalendarErrorBoundary>
    <div className="h-full flex flex-col">
      {error && (
        <StatePanel
          title="Error al cargar turnos"
          description={error}
          variant="error"
          action={
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 dark:hover:bg-rose-800/60 transition-colors cursor-pointer select-none"
            >
              <RefreshCcw className="w-4 h-4" />
              Reintentar
            </button>
          }
        />
      )}
      {(!services || services.length === 0) && (
        <StatePanel title="Sin servicios" description="No hay servicios registrados. Agregá servicios en la sección Servicios." />
      )}
      {(!staff || staff.length === 0) && (
        <StatePanel title="Sin personal" description="No hay personal registrado. Agregá personal en la sección Personal." />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight leading-none">Calendario</h1>
        <div className="flex flex-col gap-2 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setStaffFilter(null)}
              className={`relative z-10 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer select-none ${
                staffFilter === null
                  ? "text-[#0071E3] dark:text-[#5da8ff]"
                  : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {staffFilter === null && (
                <motion.span
                  layoutId="staffTab"
                  className="absolute inset-0 rounded-full bg-[#0071E3]/20 dark:bg-[#0071E3]/30 border border-[#0071E3]/30 dark:border-[#0071E3]/40 shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative z-10">Todos</span>
            </button>
            {staff.map((s) => {
              const isActive = staffFilter === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStaffFilter(isActive ? null : s.id)}
                  className={`relative z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer select-none ${
                    isActive
                      ? "text-[#0071E3] dark:text-[#5da8ff]"
                      : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="staffTab"
                      className="absolute inset-0 rounded-full bg-[#0071E3]/20 dark:bg-[#0071E3]/30 border border-[#0071E3]/30 dark:border-[#0071E3]/40 shadow-sm"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAFF_SEGMENTED_COLORS[staff.indexOf(s) % STAFF_SEGMENTED_COLORS.length] }} />
                  <span className="relative z-10">{s.name || s.email}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-zinc-200 dark:border-zinc-700 w-full" />
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { key: null, label: "Todos" },
              { key: "scheduled", label: "Nuevo" },
              { key: "confirmed", label: "Confirmado" },
              { key: "completed", label: "Completado" },
            ].map((opt) => (
              <button
                key={opt.key ?? "all"}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={`relative z-10 text-[11px] font-medium px-2 py-1 rounded-full transition-colors cursor-pointer select-none ${
                  statusFilter === opt.key
                    ? "text-[#0071E3] dark:text-[#5da8ff]"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                {statusFilter === opt.key && (
                  <motion.span
                    layoutId="statusTab"
                    className="absolute inset-0 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <CalendarView
          appointments={filteredAppointments}
          currentDate={currentDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
          onSlotClick={handleSlotClick}
          onAppointmentClick={handleAppointmentClick}
          staffList={staff}
          staffFilter={staffFilter}
          businessHours={businessHours}
          onViewModeChange={(m) => { calendarViewModeRef.current = m; }}
          onBatchClick={() => setBatchModalOpen(true)}
          initialViewMode={initialViewMode as "week" | "day" | "month" | undefined}
          onMoveAppointment={handleMoveAppointment}
          onMonthChange={handleMonthChange}
          autoCompleteEnabled={autoCompleteOn}
          onToggleAutoComplete={handleToggleAutoComplete}
          canToggleAutoComplete={isOwner}
        />
      </div>

      <AppointmentFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSuccess={async () => {
          const weekStart = getArgentinaWeekStart();
          const rangeStart = new Date(weekStart);
          rangeStart.setUTCDate(weekStart.getUTCDate() - 7);
          const result = await fetchAppointments(rangeStart.toISOString(), fetchedRangeEndRef.current, shopId);
          if (result.success && Array.isArray(result.data)) {
            setAppointments(result.data as Appointment[]);
          }
        }}
        initialDate={formInitialDate}
        initialHour={formInitialHour}
        services={services}
        staff={staff}
        customers={customers}
        shopId={shopId}
      />

      <AppointmentDetailModal
        key={selectedAppointment?.id || "none"}
        appointment={selectedAppointment}
        shopId={shopId}
        staff={staff}
        services={services}
        allAppointments={enrichedAppointments}
        onClose={() => setSelectedAppointment(null)}
        onSuccess={refreshAppointments}
        onDeleted={(recurringGroupId) => {
          if (recurringGroupId) {
            setAppointments((prev) => prev.filter((a) => a.recurring_group_id !== recurringGroupId));
          } else {
            const deletedId = selectedAppointment?.id;
            if (deletedId) {
              setAppointments((prev) => prev.filter((a) => a.id !== deletedId));
            }
          }
        }}
      />

      <BatchAppointmentModal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onSuccess={refreshAppointments}
        services={services}
        staff={staff}
        customers={customers}
        shopId={shopId}
      />
    </div>
    </CalendarErrorBoundary>
  );
}






