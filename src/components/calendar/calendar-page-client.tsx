"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { addWeeks, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import CalendarView from "./calendar-view";
import AppointmentFormModal from "./appointment-form-modal";
import AppointmentDetailModal from "./appointment-detail-modal";
import { StatePanel } from "@/components/ui/state-panel";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import { supabase } from "@/lib/supabase";

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
}: CalendarPageClientProps) {
  const router = useRouter();
  const resolvedAppointments = useMemo(() => {
    if (!Array.isArray(initialAppointments) || initialAppointments.length === 0) return [];

    const servicesById = new Map(services.map((service) => [service.id, service]));

    return initialAppointments.map((appointment) => {
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
  }, [initialAppointments, services]);

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
  const [hydrated, setHydrated] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredAppointments = useMemo(() => {
    if (!statusFilter) return resolvedAppointments;
    const statuses = statusFilter === "scheduled"
      ? ["scheduled", "pending_payment"]
      : statusFilter === "confirmed"
        ? ["confirmed", "in_progress"]
        : statusFilter === "cancelled"
          ? ["cancelled", "no_show"]
          : [statusFilter];
    return resolvedAppointments.filter((a) => statuses.includes(a.status));
  }, [resolvedAppointments, statusFilter]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!initialAppointmentId) return;
    const found = resolvedAppointments.find((a) => a.id === initialAppointmentId);
    if (found) {
      setSelectedAppointment(found);
    }
  }, [initialAppointmentId, resolvedAppointments]);

  useAppointmentAlarm(resolvedAppointments);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        router.refresh();
      }, 3000);
    };

    const channel = supabase
      .channel(`calendar-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `shop_id=eq.${shopId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `shop_id=eq.${shopId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_memberships", filter: `shop_id=eq.${shopId}` }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [shopId, router]);

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

  if (!hydrated) {
    return <CalendarSkeleton />;
  }

  return (
    <div className="h-full flex flex-col">
      {error && (
        <StatePanel title="Error al cargar turnos" description={error} variant="error" />
      )}
      {(!services || services.length === 0) && (
        <StatePanel title="Sin servicios" description="No hay servicios registrados. Agregá servicios en la sección Servicios." />
      )}
      {(!staff || staff.length === 0) && (
        <StatePanel title="Sin personal" description="No hay personal registrado. Agregá personal en la sección Personal." />
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Calendario</h1>
        </div>
        <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFormInitialDate(undefined);
              setFormInitialHour(undefined);
              setFormModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none"
          >
            <Plus className="h-4 w-4" />
            Agregar turno
          </button>
          <div className="flex flex-wrap items-center rounded-2xl sm:rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 p-0.5 shadow-sm relative gap-1">
          <button
            type="button"
            onClick={() => setStaffFilter(null)}
            className={`relative z-10 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer select-none ${
              staffFilter === null
                ? "text-[#0071E3] dark:text-[#5da8ff]"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {staffFilter === null && (
              <motion.span
                layoutId="activeTab"
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
                className={`relative z-10 inline-flex max-w-full items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer select-none ${
                  isActive
                    ? "text-[#0071E3] dark:text-[#5da8ff]"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-full bg-[#0071E3]/20 dark:bg-[#0071E3]/30 border border-[#0071E3]/30 dark:border-[#0071E3]/40 shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAFF_SEGMENTED_COLORS[staff.indexOf(s) % STAFF_SEGMENTED_COLORS.length] }} />
                <span className="relative z-10 max-w-[92px] sm:max-w-none truncate">{s.name || s.email}</span>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Filtro por estado */}
      <div className="flex items-center gap-1 mb-4 -mt-1">
        {[
          { key: null, label: "Todos" },
          { key: "scheduled", label: "Pendiente" },
          { key: "confirmed", label: "Confirmado" },
          { key: "completed", label: "Completado" },
          { key: "cancelled", label: "Cancelado" },
        ].map((opt) => (
          <button
            key={opt.key ?? "all"}
            type="button"
            onClick={() => setStatusFilter(opt.key)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors cursor-pointer select-none ${
              statusFilter === opt.key
                ? "text-[#0071E3] dark:text-[#5da8ff] bg-[#0071E3]/10 dark:bg-[#0071E3]/15"
                : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
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
        />
      </div>

      <AppointmentFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        initialDate={formInitialDate}
        initialHour={formInitialHour}
        services={services}
        staff={staff}
        customers={customers}
        shopId={shopId}
      />

      <AppointmentDetailModal
        appointment={selectedAppointment}
        shopId={shopId}
        staff={staff}
        services={services}
        onClose={() => setSelectedAppointment(null)}
      />
    </div>
  );
}
