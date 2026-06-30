import { fetchDashboardSummary, fetchDashboardMetrics } from "@/lib/dashboard/dashboard-summary";
import { CalendarDays, AlertTriangle, TrendingUp, Clock, ChevronRight } from "lucide-react";
import ShareLinkCard from "@/components/dashboard/share-link-card";
import PwaInstallButton from "@/components/dashboard/pwa-install-button";
import HoverScale from "@/components/ui/hover-scale";
import { fetchWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { buildWhatsAppContactUrl } from "@/lib/dashboard/whatsapp-utils";
import { createServiceRoleClient, getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { getShopFeatures } from "@/lib/industry/features";
import { withDashboardBase } from "@/lib/dashboard/dashboard-base";
import Link from "next/link";
import dynamicImport from "next/dynamic";
import { redirect } from "next/navigation";
import { fetchTodayVoucherAlerts } from "@/lib/dashboard/voucher-actions";
import type { CSSProperties } from "react";
import AINotificationCard from "@/components/dashboard/ai-notification-card";
import DashboardChartsWrapper from "@/components/dashboard/dashboard-charts-wrapper";

const VoucherBirthdayAlert = dynamicImport(() => import("@/components/dashboard/voucher-birthday-alert"));

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

function formatHealth(value: number | null): string {
  if (value === null) return "N/D";
  return `${value}/100`;
}

function sameMonthDay(date: Date, monthIndex: number, day: number): boolean {
  return date.getMonth() === monthIndex && date.getDate() === day;
}

function thirdSundayOfOctober(year: number): Date {
  const firstDay = new Date(year, 9, 1);
  const firstSundayOffset = (7 - firstDay.getDay()) % 7;
  const day = 1 + firstSundayOffset + 14;
  return new Date(year, 9, day);
}

function seasonalMomentLabel(now: Date, customerPlural: string): string | null {
  if (sameMonthDay(now, 1, 14)) return "14 de febrero - San Valentín. Buen momento para promociones.";
  if (sameMonthDay(now, 2, 8)) return "8 de marzo - Día de la Mujer. Oportunidad para campañas especiales.";
  if (sameMonthDay(now, 2, 21)) return "21 de marzo - Inicio de temporada. Ideal para renovar tu oferta.";
  if (sameMonthDay(now, 5, 21)) return "21 de junio - Día del Padre. Momento clave para promocionar.";
  if (sameMonthDay(now, 7, 25)) return "25 de agosto - Fecha especial del rubro. Aprovechá para campañas.";
  if (sameMonthDay(now, 8, 21)) return "21 de septiembre - Inicio de temporada. Prepará tus servicios.";
  const thirdSunday = thirdSundayOfOctober(now.getFullYear());
  if (now.getMonth() === 9 && now.getDate() === thirdSunday.getDate()) return "Día de la Madre. Oportunidad para llegar a más " + customerPlural + ".";
  if (now.getMonth() === 11) return "Diciembre - Fiestas de fin de año. Aumentá tu presencia digital.";
  return null;
}

export async function DashboardHomeContent(shopIdOverride?: string, shopSlugOverride?: string) {
  const [summaryResult, metricsResult, whatsappTemplateResult, voucherAlertsResult, socialLinks, industry, features] = await Promise.all([
    fetchDashboardSummary(shopIdOverride),
    fetchDashboardMetrics(shopIdOverride),
    fetchWhatsappTemplate(shopIdOverride),
    fetchTodayVoucherAlerts(shopIdOverride),
    fetchShopLinks(shopIdOverride),
    fetchShopIndustry(shopIdOverride, shopSlugOverride || null),
    getShopFeatures(shopIdOverride as string),
  ]);
  const whatsappTemplate = whatsappTemplateResult.success ? (whatsappTemplateResult.data ?? DEFAULT_WHATSAPP_TEMPLATE) : DEFAULT_WHATSAPP_TEMPLATE;

  if (!shopIdOverride) {
    return <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-5 py-3 rounded-full border border-red-200/30">Shop ID no disponible</div>;
  }

  if (!summaryResult.success || !summaryResult.data) {
    return (
      <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-5 py-3 rounded-full border border-red-200/30">
        Error al cargar resumen: {summaryResult.success ? "Datos no disponibles" : summaryResult.error}
      </div>
    );
  }
  const summary = summaryResult.data;
  const labels = INDUSTRY_CONFIG[industry].labels;
  const customerPlural = labels.customerPlural;
  const servicePlural = labels.servicePlural;
  const metrics = metricsResult.success && metricsResult.data ? metricsResult.data : null;
  const dashboardBasePath = summary.shopSlug ? `/dashboard/${summary.shopSlug}` : "/dashboard";

  const healthScore = metrics?.healthScore ?? null;
  const healthColor = healthScore === null ? "text-zinc-500 dark:text-zinc-400" : healthScore >= 75 ? "text-green-600" : healthScore >= 50 ? "text-amber-600" : "text-red-600";
  const healthBg = healthScore === null ? "bg-zinc-500/10" : healthScore >= 75 ? "bg-green-500/10" : healthScore >= 50 ? "bg-amber-500/10" : "bg-red-500/10";
  const nextAppointment = summary.nextAppointments[0];
  const minutesToNextAppointment = nextAppointment
    ? Math.round((new Date(nextAppointment.start_time).getTime() - Date.now()) / 60000)
    : null;
  const todayVouchersCount = voucherAlertsResult.success ? voucherAlertsResult.data?.length || 0 : 0;
  const loyaltyRewardsCount = summary.loyaltyRewardsReadyCount || 0;
  const firstLoyaltyCustomer = summary.loyaltyRewardCustomerNames?.[0] || null;
  const extraLoyaltyCustomers = Math.max(0, loyaltyRewardsCount - 1);
  const aiMessages: Array<{ id: string; title: string; body: string; tone: "urgent" | "action" | "insight"; href: string }> = [];

  const seasonalLabel = seasonalMomentLabel(new Date(), customerPlural);
  if (seasonalLabel) {
    aiMessages.push({
      id: "seasonal",
      title: "Fecha importante detectada",
      body: `${seasonalLabel}. Te recomiendo campaña y contenido hoy mismo.`,
      tone: "insight",
      href: withDashboardBase("/dashboard/business", dashboardBasePath),
    });
  }

  if (typeof minutesToNextAppointment === "number" && minutesToNextAppointment >= 0 && minutesToNextAppointment <= 90) {
    aiMessages.push({
      id: "next-appointment",
      title: "Agenda en movimiento",
      body: `Tenés un turno en ${Math.max(1, minutesToNextAppointment)} min${nextAppointment?.customers?.nombre ? ` (${nextAppointment.customers.nombre})` : ""}.`,
      tone: "urgent",
      href: withDashboardBase("/dashboard/calendar", dashboardBasePath),
    });
  }

  if (summary.appointmentsCount === 0) {
    aiMessages.push({
      id: "empty-day",
      title: "Oportunidad del día",
      body: "La agenda está tranquila. Es un buen momento para activar recordatorios por WhatsApp.",
      tone: "action",
      href: withDashboardBase("/dashboard/calendar", dashboardBasePath),
    });
  } else {
    aiMessages.push({
      id: "appointments-volume",
      title: "Pulso de agenda",
      body: `Hoy tenés ${summary.appointmentsCount} turno(s) cargado(s).`,
      tone: "insight",
      href: withDashboardBase("/dashboard/calendar", dashboardBasePath),
    });
  }

  if (features.inventory && summary.lowStockCount > 0) {
    aiMessages.push({
      id: "low-stock",
      title: "Stock en alerta",
      body: `${summary.lowStockCount} producto(s) están bajos. Conviene reponer antes de hora pico.`,
      tone: "urgent",
      href: withDashboardBase("/dashboard/inventory", dashboardBasePath),
    });
  }

  if (features.vouchers && todayVouchersCount > 0) {
    aiMessages.push({
      id: "birthday-voucher",
      title: "Cumpleaños detectados",
      body: `Hay ${todayVouchersCount} voucher(s) de cumple listos para enviar hoy.`,
      tone: "action",
      href: withDashboardBase("/dashboard/vouchers", dashboardBasePath),
    });
  }

  if (features.marketing && loyaltyRewardsCount > 0) {
    aiMessages.push({
      id: "loyalty",
      title: "Clientes para fidelizar",
      body: firstLoyaltyCustomer
        ? `${firstLoyaltyCustomer}${extraLoyaltyCustomers > 0 ? ` y ${extraLoyaltyCustomers} más` : ""} tienen canje disponible.`
        : `${customerPlural} tienen canjes disponibles.`,
      tone: "action",
      href: withDashboardBase("/dashboard/fidelizacion", dashboardBasePath),
    });
  }

  const todayFlow = metrics?.flowByPeriod.today;
  if (todayFlow) {
    aiMessages.push({
      id: "cashflow",
      title: "Caja en tiempo real",
      body: `Hoy ingresan $${Math.round(todayFlow.income).toLocaleString("es-AR")} y egresan $${Math.round(todayFlow.expenses).toLocaleString("es-AR")}.`,
      tone: "insight",
      href: withDashboardBase("/dashboard/finances", dashboardBasePath),
    });
  }

  const topService = metrics?.topServices?.[0];
  if (topService) {
    aiMessages.push({
      id: "top-service",
      title: "Servicio estrella",
      body: `${topService.name} lidera hoy con ${topService.count} reserva(s).`,
      tone: "insight",
      href: withDashboardBase("/dashboard/business", dashboardBasePath),
    });
  }

  if (aiMessages.length === 0) {
    aiMessages.push({
      id: "all-good",
      title: "Todo en orden",
      body: "No hay alertas urgentes ahora. Me quedo monitoreando tu local en vivo.",
      tone: "insight",
      href: withDashboardBase("/dashboard/calendar", dashboardBasePath),
    });
  }

  const cards = [
    {
      label: "Turnos hoy",
      value: summary.appointmentsCount,
      icon: CalendarDays,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    ...(features.inventory
      ? [{
          label: "Alertas de stock",
          value: summary.lowStockCount,
          icon: AlertTriangle,
          color: "text-amber-600",
          bg: "bg-amber-500/10",
        }]
      : []),
    {
      label: "Rendimiento",
      value: formatHealth(healthScore),
      icon: TrendingUp,
      color: healthColor,
      bg: healthBg,
    },
  ];

  const cardHrefByLabel: Record<string, string> = {
    "Turnos hoy": withDashboardBase("/dashboard/calendar", dashboardBasePath) + "?view=day",
    ...(features.inventory ? { "Alertas de stock": withDashboardBase("/dashboard/inventory", dashboardBasePath) } : {}),
    "Rendimiento": withDashboardBase("/dashboard/business#estadisticas", dashboardBasePath),
  };

  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const whatsappHref = buildWhatsAppContactUrl(
    socialLinks.phone,
    ""
  );
  const instagramHref = normalizeSocialUrl(socialLinks.instagramUrl, "instagram");
  const facebookHref = normalizeSocialUrl(socialLinks.facebookUrl, "facebook");
  const tiktokHref = normalizeSocialUrl(socialLinks.tiktokUrl, "tiktok");

  return (
    <div className="space-y-6">
      {(shopSlugOverride || summary.shopSlug) && voucherAlertsResult.success && (voucherAlertsResult.data?.length || 0) > 0 && (
        <VoucherBirthdayAlert shopSlug={shopSlugOverride || summary.shopSlug} items={voucherAlertsResult.data || []} />
      )}
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white capitalize tracking-tight leading-tight">
            {today}
          </h1>
          <div className="mt-4 flex min-w-0 items-center gap-2">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group inline-flex items-center justify-center rounded-full rounded-tr-none w-10 h-10 text-white shrink-0 transition-all duration-150 ease-out hover:scale-110 hover:-translate-y-1 hover:shadow-xl"
              aria-label="Abrir WhatsApp"
              title="WhatsApp"
              style={{
                background: "linear-gradient(135deg, #7bcfa3 0%, #69bb93 100%)",
                boxShadow: "0 8px 18px rgba(105,187,147,0.22), inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            >
              <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current relative z-10" aria-hidden="true">
                <path d="M12.04 2C6.53 2 2.06 6.47 2.06 11.98c0 1.94.55 3.83 1.6 5.46L2 22l4.72-1.63a9.93 9.93 0 0 0 5.32 1.54h.01c5.51 0 9.98-4.47 9.98-9.98A9.98 9.98 0 0 0 12.04 2Zm5.82 14.25c-.24.68-1.39 1.3-1.92 1.38-.49.07-1.12.1-1.81-.12-.42-.13-.95-.31-1.64-.61-2.88-1.25-4.76-4.16-4.91-4.36-.15-.2-1.17-1.56-1.17-2.97 0-1.41.74-2.1 1-2.39.26-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2.01.9 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.47-.14.17-.3.37-.43.49-.14.14-.29.3-.12.59.17.29.77 1.27 1.64 2.05 1.13 1.01 2.08 1.32 2.37 1.47.29.14.46.12.63-.07.17-.19.73-.85.92-1.14.19-.29.39-.24.66-.14.27.1 1.72.81 2.01.96.29.14.48.22.55.34.07.12.07.68-.17 1.36Z" />
              </svg>
            </a>
            {instagramHref && (
              <a href={instagramHref} target="_blank" rel="noopener noreferrer" className="relative group inline-flex items-center justify-center rounded-full rounded-bl-none w-10 h-10 text-white bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 shrink-0 transition-all duration-150 ease-out hover:scale-110 hover:-translate-y-1 hover:shadow-xl" aria-label="Abrir Instagram" title="Instagram">
                <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current relative z-10" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5Zm9.15 1.35a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" /></svg>
              </a>
            )}
            {facebookHref && (
              <a href={facebookHref} target="_blank" rel="noopener noreferrer" className="relative group inline-flex items-center justify-center rounded-full rounded-tr-none w-10 h-10 text-white bg-[#1877F2] shrink-0 transition-all duration-150 ease-out hover:scale-110 hover:-translate-y-1 hover:shadow-xl" aria-label="Abrir Facebook" title="Facebook">
                <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current relative z-10" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.6-1.6h1.7V4.8c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4V11H8v3h2.6v8h2.9Z" /></svg>
              </a>
            )}
            {tiktokHref && (
              <a href={tiktokHref} target="_blank" rel="noopener noreferrer" className="relative group inline-flex items-center justify-center rounded-full rounded-bl-none w-10 h-10 text-white bg-black shrink-0 transition-all duration-150 ease-out hover:scale-110 hover:-translate-y-1 hover:shadow-xl" aria-label="Abrir TikTok" title="TikTok">
                <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current relative z-10" aria-hidden="true"><path d="M14.5 3c.2 1.9 1.3 3.5 3.1 4.2.8.3 1.6.5 2.4.5v2.6c-1.8 0-3.7-.5-5.2-1.5v6.1c0 3.1-2.5 5.6-5.6 5.6S3.6 18 3.6 14.9s2.5-5.6 5.6-5.6c.3 0 .6 0 .9.1V12c-.3-.1-.6-.2-.9-.2-1.7 0-3.1 1.4-3.1 3.1S7.5 18 9.2 18s3.1-1.4 3.1-3.1V3h2.2Z" /></svg>
              </a>
            )}
          </div>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 font-medium">
            Resumen de tu negocio
          </p>
        </div>
        <div className="hidden lg:block pt-1.5 pl-6">
          <p className="dashboard-shopname-hero text-right text-6xl xl:text-7xl font-extrabold tracking-tight text-gray-900 dark:text-white max-w-[36rem] break-words text-balance leading-[1.15]">
            {summary.shopName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }, idx) => {
          const isHealthCard = label === "Rendimiento";
          const healthFill = healthScore === null ? 18 : Math.min(Math.max(healthScore, 8), 100);
          const hasProgress = isHealthCard;
          const sheenStyle: CSSProperties & Record<"--sheen-delay" | "--sheen-duration", string> = {
            "--sheen-delay": `${-0.5 - idx * 2.1}s`,
            "--sheen-duration": `${13.6 + (idx % 3) * 0.8}s`,
          };
          return (
          <HoverScale key={label}>
            <Link href={cardHrefByLabel[label] || dashboardBasePath} className="block h-full">
              <div
                className={`glass-sheen-card h-full min-h-[124px] lg:min-h-[132px] bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 flex items-center gap-4 transition-colors cursor-pointer ${
                  label === "Rendimiento" ? "rounded-bl-none" : "rounded-br-none"
                } ${idx === 1 ? "card-enter-left" : "card-enter-right"}`}
                style={sheenStyle}
              >
                <div className={`p-3 rounded-xl ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="relative z-10 flex-1 min-w-0 flex flex-col">
                  <p className="text-sm text-gray-500 dark:text-zinc-400">{label}</p>
                  <p className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">{value}</p>
                  {isHealthCard && (
                    <div className="mt-2.5">
                      <div className="h-2 w-full rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500 ease-out"
                          style={{ width: `${healthFill}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {!hasProgress && <div className="mt-2.5 h-2" aria-hidden="true" />}
                </div>
              </div>
            </Link>
          </HoverScale>
          );
        })}
        <AINotificationCard
          messages={aiMessages.map((item) => ({ id: item.id, title: item.title, body: item.body, tone: item.tone, href: item.href }))}
        />
      </div>

      <div className="relative z-10">
        <DashboardChartsWrapper
          revenueData={metrics?.revenueChart ?? []}
          dailyBreakdown={metrics?.dailyBreakdown ?? []}
          hourlyBreakdown={metrics?.hourlyBreakdown ?? []}
          flowByPeriod={metrics?.flowByPeriod}
          topServicesData={metrics?.topServices ?? []}
          serviceLabelPlural={servicePlural}
          clientsData={metrics?.monthlyGrowth ?? []}
          monthlyRevenueData={metrics?.revenueChart ?? []}
          healthScore={metrics?.healthScore ?? null}
          healthBreakdown={metrics?.healthBreakdown ?? null}
          totalClients={metrics?.stats.totalClients ?? 0}
        />
        <div className="mt-4">
          <ShareLinkCard slug={shopSlugOverride || summary.shopSlug} />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/50">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
            <Clock className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
            Próximos turnos
          </h2>
        </div>

        {summary.nextAppointments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No hay turnos programados para hoy.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {summary.nextAppointments.map((appt) => {
              const start = new Date(appt.start_time);
              const end = new Date(appt.end_time);
              const clientName = appt.customers?.nombre || "Sin nombre";
              const initials = getInitials(clientName);
              const colorClass = stringToColor(clientName);

              return (
                <div
                  key={appt.id}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer"
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${colorClass}`}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-snug">
                      {clientName}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {(appt.services?.name || "Sin servicio") + (appt.services?.price ? ` · $${Number(appt.services.price).toFixed(2)}` : "")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                        {start.toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {end.toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 dark:group-hover:text-zinc-500 transition-colors -mr-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PwaInstallButton />
      <style>{`
        @media (max-width: 639px) {
          @keyframes cardFromRight { from { transform: translateX(60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes cardFromLeft { from { transform: translateX(-60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          .card-enter-right { animation: cardFromRight 0.5s cubic-bezier(0.16,1,0.3,1) both; will-change: transform; }
          .card-enter-left { animation: cardFromLeft 0.5s cubic-bezier(0.16,1,0.3,1) both; will-change: transform; }
        }
        .flow-mini {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .analytics-card-bg::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background:
            radial-gradient(120% 60% at 0% 100%, rgba(16,185,129,0.1) 0%, transparent 60%),
            radial-gradient(120% 60% at 100% 0%, rgba(244,114,182,0.1) 0%, transparent 62%);
          background-size: 160% 120%, 160% 120%;
          animation: analyticsCardWave 18s linear infinite;
          opacity: 0.65;
        }
        .flow-mini::before {
          content: "";
          position: absolute;
          inset: -35%;
          border-radius: inherit;
          background:
            linear-gradient(112deg, transparent 22%, rgba(255,255,255,0.34) 48%, transparent 74%),
            linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.02) 52%, rgba(0,0,0,0.1) 100%);
          background-size: 220% 100%, 100% 100%;
          animation: flowMiniSheen 5.2s cubic-bezier(0.28, 0.16, 0.2, 1) infinite;
          pointer-events: none;
        }
        .flow-mini::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0));
          opacity: 0.4;
          pointer-events: none;
        }
        .flow-mini-pos {
          background: linear-gradient(90deg, rgba(52,211,153,0.7) 0%, rgba(16,185,129,0.86) 100%);
        }
        .flow-mini-neg {
          background: linear-gradient(90deg, rgba(251,146,160,0.7) 0%, rgba(244,114,182,0.86) 100%);
        }
        @keyframes flowMiniSheen {
          0% { background-position: 170% 0, 0 0; }
          58% { background-position: 20% 0, 0 0; }
          100% { background-position: -90% 0, 0 0; }
        }
        @keyframes analyticsCardWave {
          0% { background-position: 0% 100%, 100% 0%; }
          100% { background-position: 100% 100%, 0% 0%; }
        }
        .dashboard-shopname-hero {
          animation: shopNameSlideIn 180ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
        }
        @keyframes shopNameSlideIn {
          from { opacity: 0; transform: translate3d(16px, -8px, 0) scale(0.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        .social-tag-hero {
          animation: socialTagReveal 680ms cubic-bezier(0.22, 1, 0.36, 1) both,
                     socialTagShimmer 7s ease-in-out 1s infinite;
          will-change: transform, filter, background-position;
        }
        .social-tag-hero:hover {
          transform: translateY(-2px) scale(1.02);
          filter: saturate(1.15) brightness(1.05);
          animation-duration: 680ms, 2.5s;
        }
        @keyframes socialTagReveal {
          from { opacity: 0; transform: translate3d(10px, 0, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes socialTagShimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const admin = await createServiceRoleClient();
  const { data: memberships } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "staff"])
    .limit(1);

  const firstShopId = memberships?.[0]?.shop_id;
  if (!firstShopId) {
    redirect("/onboarding/create-shop");
  }

  const { data: shop } = await admin
    .from("shops")
    .select("slug, nombre, address")
    .eq("id", firstShopId)
    .maybeSingle();

  if (!shop?.slug) {
    redirect("/onboarding/create-shop");
  }

  const { count: servicesCount } = await admin
    .from("services")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", firstShopId);

  const needsTutorial = !shop?.nombre?.trim() || !shop?.address?.trim() || !servicesCount;

  if (needsTutorial) {
    redirect(`/dashboard/${shop.slug}/business`);
  }

  redirect(`/dashboard/${shop.slug}`);
}

function normalizeSocialUrl(value: string | null, platform?: "instagram" | "facebook" | "tiktok"): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) {
    const handle = trimmed.slice(1);
    if (!handle) return null;
    if (platform === "instagram") return `https://instagram.com/${handle}`;
    if (platform === "tiktok") return `https://tiktok.com/@${handle}`;
    return `https://facebook.com/${handle}`;
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.)?(instagram|facebook|tiktok)\.com\//i.test(trimmed)) {
    return `https://${trimmed.replace(/^www\./i, "")}`;
  }
  if (platform === "instagram") return `https://instagram.com/${trimmed}`;
  if (platform === "tiktok") return `https://tiktok.com/@${trimmed}`;
  if (platform === "facebook") return `https://facebook.com/${trimmed}`;
  return `https://${trimmed}`;
}

async function fetchShopLinks(shopIdOverride?: string): Promise<{ phone: string | null; instagramUrl: string | null; facebookUrl: string | null; tiktokUrl: string | null }> {
  let shopId = shopIdOverride || null;
  if (!shopId) {
    const session = await getAuthSession();
    if (!session) return { phone: null, instagramUrl: null, facebookUrl: null, tiktokUrl: null };
    shopId = await getShopId(session);
  }
  if (!shopId) return { phone: null, instagramUrl: null, facebookUrl: null, tiktokUrl: null };
  const admin = await createServiceRoleClient();
  const { data, error } = await admin
    .from("shops")
    .select("phone, instagram_url, facebook_url, tiktok_url")
    .eq("id", shopId)
    .maybeSingle();
  if (error) {
    console.error("[fetchShopLinks] error:", error.message);
    return { phone: null, instagramUrl: null, facebookUrl: null, tiktokUrl: null };
  }
  return {
    phone: data?.phone || null,
    instagramUrl: data?.instagram_url || null,
    facebookUrl: (data as { facebook_url?: string | null } | null)?.facebook_url || null,
    tiktokUrl: (data as { tiktok_url?: string | null } | null)?.tiktok_url || null,
  };
}

async function fetchShopIndustry(shopIdOverride?: string, shopSlugOverride?: string | null) {
  let shopId = shopIdOverride || null;
  const admin = await createServiceRoleClient();

  if (!shopId && shopSlugOverride) {
    const { data: bySlug } = await admin
      .from("shops")
      .select("id")
      .eq("slug", shopSlugOverride)
      .maybeSingle();
    shopId = bySlug?.id || null;
  }

  if (!shopId) {
    const session = await getAuthSession();
    if (!session) return resolveIndustry(null);
    shopId = await getShopId(session);
  }

  if (!shopId) return resolveIndustry(null);

  const { data } = await admin
    .from("shops")
    .select("industry")
    .eq("id", shopId)
    .maybeSingle();

  return resolveIndustry((data as { industry?: string | null } | null)?.industry || null);
}
