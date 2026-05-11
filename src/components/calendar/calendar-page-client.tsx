"use client";

import { useState } from "react";
import { addWeeks, subWeeks } from "date-fns";
import CalendarView from "./calendar-view";
import AppointmentFormModal from "./appointment-form-modal";
import AppointmentDetailModal from "./appointment-detail-modal";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { getArgentinaDateKey } from "@/lib/argentina-time";

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
  name: string;
  email: string | null;
  phone: string | null;
};

interface CalendarPageClientProps {
  initialAppointments: Appointment[];
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  error?: string | null;
}

export default function CalendarPageClient({
  initialAppointments,
  services,
  staff,
  customers,
  error,
}: CalendarPageClientProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>();
  const [formInitialHour, setFormInitialHour] = useState<number | undefined>();
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [staffFilter, setStaffFilter] = useState<string | null>(null);

  useAppointmentAlarm(initialAppointments);

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Calendario</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Filtrar por:</label>
          <select
            value={staffFilter || ""}
            onChange={(e) => setStaffFilter(e.target.value || null)}
            className="px-3 py-1.5 border border-white/10 dark:border-white/5 bg-white/40 dark:bg-black/30 backdrop-blur-md rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-all cursor-pointer shadow-sm"
          >
            <option value="">Todos los peluqueros</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.email}
              </option>
            ))}
          </select>
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
