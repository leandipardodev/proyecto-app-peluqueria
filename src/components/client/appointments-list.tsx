"use client";

import { useActionState } from "react";
import { CalendarDays, Clock, DollarSign, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  notes: string | null;
  service: { name: string; price: number; duration_minutes: number } | null;
  staff: { name: string | null } | null;
}

interface ClientAppointmentsListProps {
  appointments: Appointment[];
  onCancel: (formData: FormData) => void;
}

const statusColors: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-gray-100 text-gray-800",
};

const statusLabels: Record<string, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En progreso",
  completed: "Completado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

export default function ClientAppointmentsList({
  appointments,
  onCancel,
}: ClientAppointmentsListProps) {
  const [cancelState, cancelAction] = useActionState(
    async (_prevState: void | null, formData: FormData) => {
      await onCancel(formData);
      return _prevState;
    },
    null
  );

  function formatStatus(status: string) {
    return statusLabels[status] || status;
  }

  function formatDateTime(dateStr: string) {
    const date = new Date(dateStr);
    return {
      date: format(date, "EEE d MMM yyyy", { locale: es }),
      time: format(date, "HH:mm", { locale: es }),
    };
  }

  const upcoming = appointments.filter(
    (a) => new Date(a.start_time) > new Date() && a.status !== "cancelled"
  );
  const past = appointments.filter(
    (a) =>
      new Date(a.start_time) <= new Date() || a.status === "cancelled"
  );

  return (
    <div className="space-y-6">
      {/* Upcoming Appointments */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-violet-600" />
            Próximos Turnos
          </h2>
        </div>

        {upcoming.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            No tenés turnos programados.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {upcoming.map((apt) => {
              const start = formatDateTime(apt.start_time);
              const end = formatDateTime(apt.end_time);
              const isPast = new Date(apt.start_time) < new Date();

              return (
                <div
                  key={apt.id}
                  className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-10 bg-violet-500 rounded-full" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {apt.service?.name || "Servicio"}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {apt.staff?.name || "Staff no asignado"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {start.date}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {start.time} - {end.time}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          statusColors[apt.status]
                        }`}
                      >
                        {formatStatus(apt.status)}
                      </span>
                      {apt.service && (
                        <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />$
                          {apt.service.price.toFixed(2)}
                        </span>
                      )}
                      {apt.is_paid && (
                        <span className="text-xs text-green-600 font-medium">
                          Pagado
                        </span>
                      )}
                    </div>

                    {!isPast && apt.status !== "cancelled" && (
                      <form action={cancelAction}>
                        <input
                          type="hidden"
                          name="appointment_id"
                          value={apt.id}
                        />
                        <button
                          type="submit"
                          className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer select-none"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancelar
                        </button>
                      </form>
                    )}
                  </div>

                  {apt.notes && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                      Nota: {apt.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Appointments */}
      {past.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Historial de Turnos
            </h2>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {past.map((apt) => {
              const start = formatDateTime(apt.start_time);

              return (
                <div
                  key={apt.id}
                  className="px-6 py-4 opacity-75"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-10 bg-gray-300 dark:bg-gray-600 rounded-full" />
                      <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300">
                          {apt.service?.name || "Servicio"}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {start.date} - {start.time}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        statusColors[apt.status]
                      }`}
                    >
                      {formatStatus(apt.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
