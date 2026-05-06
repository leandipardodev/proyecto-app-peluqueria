import { fetchDashboardSummary } from "@/lib/dashboard/dashboard-summary";
import { CalendarDays, DollarSign, AlertTriangle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let summary: Awaited<ReturnType<typeof fetchDashboardSummary>> | null = null;

  try {
    summary = await fetchDashboardSummary();
  } catch {
    // Gracefully handle errors
  }

  const cards = [
    {
      label: "Turnos hoy",
      value: summary?.appointmentsCount ?? 0,
      icon: CalendarDays,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Ingresos hoy",
      value: summary
        ? `$${summary.revenue.toFixed(2)}`
        : "$0.00",
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Alertas de stock",
      value: summary?.lowStockCount ?? 0,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 capitalize">
          {today}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Resumen de tu peluquería
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4"
          >
            <div className={`p-3 rounded-lg ${bg}`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            Próximos turnos
          </h2>
        </div>

        {summary && summary.nextAppointments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No hay turnos programados para hoy.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {summary?.nextAppointments.map((appt) => {
              const start = new Date(appt.start_time);
              const end = new Date(appt.end_time);

              return (
                <div
                  key={appt.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-1.5 h-10 bg-violet-500 rounded-full" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {appt.customers?.name || "Sin cliente"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {appt.services?.name || "Sin servicio"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {start.toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {end.toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
