import { fetchDashboardSummary } from "@/lib/dashboard/dashboard-summary";
import { CalendarDays, DollarSign, AlertTriangle, Clock } from "lucide-react";
import ShareLinkCard from "@/components/dashboard/share-link-card";
import HoverScale from "@/components/ui/hover-scale";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const summary = await fetchDashboardSummary();

  const cards = [
    {
      label: "Turnos hoy",
      value: summary.appointmentsCount,
      icon: CalendarDays,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      label: "Ingresos hoy",
      value: `$${summary.revenue.toFixed(2)}`,
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-500/10",
    },
    {
      label: "Alertas de stock",
      value: summary.lowStockCount,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-500/10",
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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white capitalize tracking-tight">
          {today}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Resumen de tu peluquería
        </p>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 font-mono">
          RAW: {summary.appointmentsCount} turnos | ${summary.revenue} ingresos
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <HoverScale key={label}>
            <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4 transition-colors">
              <div className={`p-3 rounded-xl ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-zinc-400">{label}</p>
                <p className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">{value}</p>
              </div>
            </div>
          </HoverScale>
        ))}
      </div>

      <ShareLinkCard slug={summary.shopSlug} shopName={summary.shopName} />

      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-white/20 dark:border-white/10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
            <Clock className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            Próximos turnos
          </h2>
        </div>

        {summary.nextAppointments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No hay turnos programados para hoy.
          </div>
        ) : (
          <div className="divide-y divide-white/20 dark:divide-white/10">
            {summary.nextAppointments.map((appt) => {
              const start = new Date(appt.start_time);
              const end = new Date(appt.end_time);

              return (
                <div
                  key={appt.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-1.5 h-10 bg-violet-500 rounded-full" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {appt.customers?.name || "Sin cliente"}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {appt.services?.name || "Sin servicio"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {start.toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
