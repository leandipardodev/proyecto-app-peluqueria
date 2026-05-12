import { fetchDashboardSummary, fetchDashboardMetrics } from "@/lib/dashboard/dashboard-summary";
import { CalendarDays, DollarSign, AlertTriangle, TrendingUp, Clock, MessageCircle } from "lucide-react";
import ShareLinkCard from "@/components/dashboard/share-link-card";
import RevenueChart from "@/components/dashboard/revenue-chart";
import TopServices from "@/components/dashboard/top-services";
import HoverScale from "@/components/ui/hover-scale";
import { fetchWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { buildWhatsAppUrl } from "@/lib/dashboard/whatsapp-utils";

export const dynamic = "force-dynamic";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function stringToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    "bg-rose-500/20 text-rose-700 dark:text-rose-300",
    "bg-blue-500/20 text-blue-700 dark:text-blue-300",
    "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
  ];
  return colors[Math.abs(hash) % colors.length];
}

function formatGrowth(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value}%`;
}

export default async function DashboardPage() {
  const [summaryResult, metricsResult, whatsappTemplateResult] = await Promise.all([
    fetchDashboardSummary(),
    fetchDashboardMetrics(),
    fetchWhatsappTemplate(),
  ]);

  const whatsappTemplate = whatsappTemplateResult.success ? (whatsappTemplateResult.data ?? DEFAULT_WHATSAPP_TEMPLATE) : DEFAULT_WHATSAPP_TEMPLATE;

  if (!summaryResult.success || !summaryResult.data) {
    return (
      <div className="bg-red-50/80 backdrop-blur-md text-red-700 dark:text-red-300 text-sm px-5 py-3 rounded-full border border-red-200/30">
        Error al cargar resumen: {summaryResult.success ? "Datos no disponibles" : summaryResult.error}
      </div>
    );
  }
  const summary = summaryResult.data;
  const metrics = metricsResult.success && metricsResult.data ? metricsResult.data : null;

  const growthValue = metrics?.stats.growth ?? 0;
  const growthColor = growthValue >= 0 ? "text-green-600" : "text-red-600";
  const growthBg = growthValue >= 0 ? "bg-green-500/10" : "bg-red-500/10";

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
    {
      label: "Crecimiento",
      value: formatGrowth(growthValue),
      icon: TrendingUp,
      color: growthColor,
      bg: growthBg,
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueChart data={metrics?.revenueChart ?? []} />
        </div>
        <div className="lg:col-span-1">
          <TopServices data={metrics?.topServices ?? []} />
        </div>
      </div>

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
              const clientName = appt.customers?.nombre || "Sin nombre";
              const initials = getInitials(clientName);
              const colorClass = stringToColor(clientName);

              return (
                <div
                  key={appt.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${colorClass}`}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {clientName}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {(appt.services?.name || "Sin servicio") + (appt.services?.price ? ` · $${Number(appt.services.price).toFixed(2)}` : "")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                    {(() => {
                      const waUrl = buildWhatsAppUrl({
                        phone: null,
                        customerName: clientName,
                        serviceName: appt.services?.name,
                        time: start.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
                        template: whatsappTemplate,
                        shopName: summary.shopName,
                      });
                      return waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors"
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      ) : null;
                    })()}
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
