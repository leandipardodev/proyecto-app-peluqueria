"use client";

import { useState, useEffect } from "react";
import { addWeeks, subWeeks } from "date-fns";
import CalendarView from "./calendar-view";
import AppointmentFormModal from "./appointment-form-modal";
import AppointmentDetailModal from "./appointment-detail-modal";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { getArgentinaDateKey } from "@/lib/argentina-time";

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
  notes: string | null;
  customers: { nombre: string | null; email: string; telefono: string | null } | null;
  staff: { name: string; email: string } | null;
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

type BusinessHourEntry = { open: boolean; start: string; end: string };
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
  initialAppointments: Appointment[];
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  error?: string | null;
  businessHours?: BusinessHoursMap;
  whatsappTemplate?: string;
  shopName?: string;
}

export default function CalendarPageClient({
  initialAppointments,
  services,
  staff,
  customers,
  error,
  businessHours,
  whatsappTemplate,
  shopName,
}: CalendarPageClientProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
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

  useAppointmentAlarm(initialAppointments);

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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Calendario</h1>
        <div className="inline-flex items-center rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 p-0.5 shadow-sm">
          <button
            onClick={() => setStaffFilter(null)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer select-none ${
              staffFilter === null
                ? "bg-white/60 dark:bg-white/20 text-gray-900 dark:text-white shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Todos
          </button>
          {staff.map((s) => {
            const isActive = staffFilter === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStaffFilter(isActive ? null : s.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer select-none ${
                  isActive
                    ? "bg-white/60 dark:bg-white/20 text-gray-900 dark:text-white shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STAFF_SEGMENTED_COLORS[staff.indexOf(s) % STAFF_SEGMENTED_COLORS.length] }} />
                {s.name || s.email}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <CalendarView
          appointments={initialAppointments}
          currentDate={currentDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
          onSlotClick={handleSlotClick}
          onAppointmentClick={setSelectedAppointment}
          staffList={staff}
          staffFilter={staffFilter}
          businessHours={businessHours}
          whatsappTemplate={whatsappTemplate}
          shopName={shopName}
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
      />

      <AppointmentDetailModal
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
      />
    </div>
  );
}
