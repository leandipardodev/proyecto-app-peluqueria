"use client";

import { useState } from "react";
import { format, addWeeks, subWeeks } from "date-fns";
import CalendarView from "./calendar-view";
import AppointmentFormModal from "./appointment-form-modal";
import AppointmentDetailModal from "./appointment-detail-modal";

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

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
};

type StaffMember = {
  id: string;
  role: string;
  users: { id: string; name: string | null; email: string | null } | null;
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
}

export default function CalendarPageClient({
  initialAppointments,
  services,
  staff,
  customers,
}: CalendarPageClientProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>();
  const [formInitialHour, setFormInitialHour] = useState<number | undefined>();
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  function handleSlotClick(date: Date, hour: number) {
    setFormInitialDate(format(date, "yyyy-MM-dd"));
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendario</h1>
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
