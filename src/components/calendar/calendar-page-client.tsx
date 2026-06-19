"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { addWeeks, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { RefreshCcw } from "lucide-react";

import CalendarView from "./calendar-view";
import AppointmentFormModal from "./appointment-form-modal";
import AppointmentDetailModal from "./appointment-detail-modal";
import BatchAppointmentModal from "./batch-appointment-modal";
import { StatePanel } from "@/components/ui/state-panel";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { getArgentinaDateKey, getArgentinaWeekStart } from "@/lib/argentina-time";
import { supabase } from "@/lib/supabase";
import { fetchAppointments } from "@/lib/dashboard/appointment-query-actions";

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
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
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
}: CalendarPageClientProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    if (!initialDateParam) return new Date();
    const parsed = new Date(initialDateParam);
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
  const [hydrated, setHydrated] = useState(false);
  const calendarViewModeRef = useRef<"week" | "day" | "month">("week");
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  useEffect(() => {
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  const enrichedAppointments = useMemo(() => {
    if (!Array.isArray(appointments) || appointments.length === 0) return [];

    const servicesById = new Map(services.map((service) => [service.id, service]));

    return appointments.map((appointment) => {
      if (appointment.services?.name) return appointment;
      const fallbackService = servicesById.get(appointment.service_id);
      if (!fallbackService) return appointment;

      return {
        ...appointment,
        services: {
          name: fallbackService.name,
          price: fallbackService.price,
          duration_minutes: fallbackService.duration_minutes,
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
    if (!initialAppointmentId) return;
    const found = enrichedAppointments.find((a) => a.id === initialAppointmentId);
    if (found) {
      setSelectedAppointment(found);
    }
  }, [initialAppointmentId, enrichedAppointments]);

  useAppointmentAlarm(enrichedAppointments);

  const realtimeCooldown = useRef(false);

  useEffect(() => {
    const weekStart = getArgentinaWeekStart();
    const rangeStart = new Date(weekStart);
    rangeStart.setUTCDate(weekStart.getUTCDate() - 7);
    const rangeEnd = new Date(weekStart);
    rangeEnd.setUTCDate(weekStart.getUTCDate() + 60);
    rangeEnd.setUTCHours(23, 59, 59, 999);

    const handleChange = async () => {
      if (realtimeCooldown.current) return;
      realtimeCooldown.current = true;
      setTimeout(() => { realtimeCooldown.current = false; }, 2000);
      const { data: rows, error } = await supabase
        .from("appointments")
        .select("id, customer_id, staff_id, service_id, start_time, end_time, status, is_paid, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, recurring_group_id, notes")
        .eq("shop_id", shopId)
        .gte("start_time", rangeStart.toISOString())
        .lte("start_time", rangeEnd.toISOString())
        .order("start_time", { ascending: true });
      if (!error && rows) {
        const customerIds = [...new Set(rows.map((r) => r.customer_id))];
        const staffIds = [...new Set(rows.map((r) => r.staff_id))];
        const serviceIds = [...new Set(rows.map((r) => r.service_id))];
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
        const customersMap = new Map((customersRes.data || []).map((c: { id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null }) => [c.id, c]));
        const staffMap = new Map((staffRes.data || []).map((s: { user_id: string; name: string | null; email: string | null }) => [s.user_id, s]));
        const servicesMap = new Map((servicesRes.data || []).map((s: { id: string; name: string; price: number; duration_minutes: number }) => [s.id, s]));
        const enriched = rows.map((r) => ({
          ...r,
          customers: customersMap.get(r.customer_id) ?? null,
          staff: staffMap.get(r.staff_id) ?? null,
          services: servicesMap.get(r.service_id) ?? null,
        }));
        setAppointments((prev) => {
          if (prev.length === enriched.length && prev.every((a, i) => a.id === enriched[i].id)) return prev;
          return enriched as any;
        });
      }
    };

    const channel = supabase
      .channel(`calendar-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `shop_id=eq.${shopId}` }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `shop_id=eq.${shopId}` }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_memberships", filter: `shop_id=eq.${shopId}` }, handleChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

  const refreshAppointments = useCallback(async () => {
    const weekStart = getArgentinaWeekStart();
    const rangeStart = new Date(weekStart);
    rangeStart.setUTCDate(weekStart.getUTCDate() - 7);
    const rangeEnd = new Date(weekStart);
    rangeEnd.setUTCDate(weekStart.getUTCDate() + 60);
    rangeEnd.setUTCHours(23, 59, 59, 999);
    const result = await fetchAppointments(rangeStart.toISOString(), rangeEnd.toISOString(), shopId);
    if (result.success && Array.isArray(result.data)) {
      setAppointments(result.data as Appointment[]);
    }
  }, [shopId]);

  if (!hydrated) {
    return <CalendarSkeleton />;
  }

  return (
    <div className="h-full flex flex-col">
      {error && (
        <StatePanel
          title="Error al cargar turnos"
          description={error}
          variant="error"
          action={
            <button
              type="button"
              onClick={() => window.location.reload()}
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
        />
      </div>

      <AppointmentFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSuccess={async () => {
          const weekStart = getArgentinaWeekStart();
          const rangeStart = new Date(weekStart);
          rangeStart.setUTCDate(weekStart.getUTCDate() - 7);
          const rangeEnd = new Date(weekStart);
          rangeEnd.setUTCDate(weekStart.getUTCDate() + 60);
          rangeEnd.setUTCHours(23, 59, 59, 999);
          const result = await fetchAppointments(rangeStart.toISOString(), rangeEnd.toISOString(), shopId);
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
  );
}
