"use client";

import { useState, useEffect, useMemo } from "react";
import { addWeeks, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import CalendarView from "./calendar-view";
import AppointmentFormModal from "./appointment-form-modal";
import AppointmentDetailModal from "./appointment-detail-modal";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import { supabase } from "@/lib/supabase";

function CalendarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 rounded-full bg-white/20 dark:bg-white/10" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-20 rounded-full bg-white/20 dark:bg-white/10" />
          <div className="h-8 w-36 rounded-full bg-white/20 dark:bg-white/10" />
        </div>
      </div>
      <div className="bg-white/20 dark:bg-black/20 rounded-[2rem] border border-white/10 overflow-hidden p-4">
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-4">
              <div className="h-3 w-8 rounded-full bg-white/20 dark:bg-white/10" />
              <div className="h-5 w-5 rounded-full bg-white/20 dark:bg-white/10" />
            </div>
          ))}
        </div>
        <div className="h-[600px] bg-white/10 dark:bg-white/[0.02] rounded-2xl mt-2" />
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
  const [hydrated, setHydrated] = useState(false);

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
    const channel = supabase
      .channel(`calendar-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_memberships", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, router]);

  if (!hydrated) {
    return <CalendarSkeleton />;
  }

  function handleSlotClick(date: Date, hour: number) {
    setFormInitialDate(getArgentinaDateKey(date));
    setFormInitialHour(hour);
    setFormModalOpen(true);
  }

  function handlePrevWeek() {
    setCurrentDate((d) => subWeeks(d, 1));
  }

  function handleNextWeek() {
    setCurrentDate((d) => addWeeks(d, 1));
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  return (
    <div className="h-full flex flex-col">
      {error && (
        <div className="bg-red-100/60 dark:bg-red-950/40 backdrop-blur-sm border border-red-200/40 dark:border-red-800/30 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-xl mb-4 shadow-sm">
          Error: {error}
        </div>
      )}
      {(!services || services.length === 0) && (
        <div className="bg-amber-100/60 dark:bg-amber-950/40 backdrop-blur-sm border border-amber-200/40 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 text-sm px-4 py-3 rounded-xl mb-4 shadow-sm">
          No hay servicios registrados. Agregá servicios en la sección Servicios.
        </div>
      )}
      {(!staff || staff.length === 0) && (
        <div className="bg-amber-100/60 dark:bg-amber-950/40 backdrop-blur-sm border border-amber-200/40 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 text-sm px-4 py-3 rounded-xl mb-4 shadow-sm">
          No hay personal registrado. Agregá personal en la sección Personal.
        </div>
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
            className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors cursor-pointer select-none"
          >
            <Plus className="h-4 w-4" />
            Agregar turno
          </button>
          <div className="flex flex-wrap items-center rounded-2xl sm:rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 p-0.5 shadow-sm relative gap-1">
          <button
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

      <div className="flex-1 min-h-0">
        <CalendarView
          appointments={resolvedAppointments}
          currentDate={currentDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
          onSlotClick={handleSlotClick}
          onAppointmentClick={setSelectedAppointment}
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
