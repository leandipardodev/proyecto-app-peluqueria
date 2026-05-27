import { fetchDashboardSummary, fetchDashboardMetrics } from "@/lib/dashboard/dashboard-summary";
import { CalendarDays, Bell, AlertTriangle, TrendingUp, Clock, MessageCircle } from "lucide-react";
import ShareLinkCard from "@/components/dashboard/share-link-card";
import PwaInstallButton from "@/components/dashboard/pwa-install-button";
import HoverScale from "@/components/ui/hover-scale";
import { fetchWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { buildWhatsAppContactUrl, buildWhatsAppUrl } from "@/lib/dashboard/whatsapp-utils";
import { createServiceRoleClient, getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { fetchTodayVoucherAlerts } from "@/lib/dashboard/voucher-actions";
import type { CSSProperties } from "react";

const RevenueChart = dynamic(() => import("@/components/dashboard/revenue-chart"), {
  loading: () => <div className="h-72 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});
const TopServices = dynamic(() => import("@/components/dashboard/top-services"), {
  loading: () => <div className="h-52 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});
const MonthlyGrowthCard = dynamic(() => import("@/components/dashboard/monthly-growth-card"), {
  loading: () => <div className="h-52 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});
const VoucherBirthdayAlert = dynamic(() => import("@/components/dashboard/voucher-birthday-alert"));

export const dynamic = "force-dynamic";

const SOCIAL_TAGS = [
  "#conecta",
  "#presencia",
  "#tuMarca",
  "#identidad",
  "#comunidad",
  "#visibilidad",
  "#difusion",
  "#conexion",
  "#vinculo",
  "#marcaViva",
  "#huellaDigital",
  "#vozDeMarca",
  "#alcance",
  "#contactoDirecto",
  "#canalesDigitales",
];

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

function formatGrowth(value: number | null): string {
  if (value === null) return "N/D";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value}%`;
}

export async function DashboardHomeContent(shopIdOverride?: string, shopSlugOverride?: string) {
  const [summaryResult, metricsResult, whatsappTemplateResult, voucherAlertsResult] = await Promise.all([
    fetchDashboardSummary(shopIdOverride),
    fetchDashboardMetrics(shopIdOverride),
    fetchWhatsappTemplate(shopIdOverride),
    fetchTodayVoucherAlerts(shopIdOverride),
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
  const socialLinks = await fetchShopLinks(shopIdOverride);
  const industry = await fetchShopIndustry(shopIdOverride, shopSlugOverride || summary.shopSlug || null);
  const labels = INDUSTRY_CONFIG[industry].labels;
  const customerWord = labels.customerSingular;
  const customerPlural = labels.customerPlural;
  const servicePlural = labels.servicePlural;
  const metrics = metricsResult.success && metricsResult.data ? metricsResult.data : null;
  const dashboardBasePath = summary.shopSlug ? `/dashboard/${summary.shopSlug}` : "/dashboard";

  const withDashboardBase = (href: string) => {
    if (!href.startsWith("/dashboard")) return href;
    const tail = href.slice("/dashboard".length);
    return `${dashboardBasePath}${tail}`;
  };

  const growthValue = metrics?.stats.growth ?? null;
  const growthColor = growthValue === null ? "text-zinc-500 dark:text-zinc-400" : growthValue >= 0 ? "text-green-600" : "text-red-600";
  const growthBg = growthValue === null ? "bg-zinc-500/10" : growthValue >= 0 ? "bg-green-500/10" : "bg-red-500/10";
  const nextAppointment = summary.nextAppointments[0];
  const minutesToNextAppointment = nextAppointment
    ? Math.round((new Date(nextAppointment.start_time).getTime() - Date.now()) / 60000)
    : null;
  const todayVouchersCount = voucherAlertsResult.success ? voucherAlertsResult.data?.length || 0 : 0;
  const loyaltyRewardsCount = summary.loyaltyRewardsReadyCount || 0;
  const firstLoyaltyCustomer = summary.loyaltyRewardCustomerNames?.[0] || null;
  const extraLoyaltyCustomers = Math.max(0, loyaltyRewardsCount - 1);
  const notificationCard =
    typeof minutesToNextAppointment === "number" && minutesToNextAppointment >= 0 && minutesToNextAppointment <= 60
      ? {
          kind: "appointment" as const,
          value: `Turno en ${Math.max(1, minutesToNextAppointment)} min`,
          hint: nextAppointment?.customers?.nombre ? `${customerWord}: ${nextAppointment.customers.nombre}` : "Proximo turno confirmado",
        }
      : todayVouchersCount > 0
        ? {
            kind: "voucher" as const,
            value: `${todayVouchersCount} cumpleanos hoy`,
            hint: "Hay vouchers para enviar hoy",
          }
        : loyaltyRewardsCount > 0
          ? {
              kind: "loyalty" as const,
              value: `${loyaltyRewardsCount} canje(s) listo(s)`,
              hint: firstLoyaltyCustomer
                ? extraLoyaltyCustomers > 0
                  ? `${firstLoyaltyCustomer} + ${extraLoyaltyCustomers} cliente(s) con canje`
                  : `${firstLoyaltyCustomer} tiene un canje listo`
                : `${customerPlural} alcanzaron meta de cortes`,
            }
          : {
              kind: "none" as const,
              value: "Sin alertas urgentes",
              hint: "Todo bajo control por ahora",
            };

  const notificationHref =
    notificationCard.kind === "voucher"
      ? withDashboardBase("/dashboard/vouchers")
      : notificationCard.kind === "loyalty"
        ? withDashboardBase("/dashboard/fidelizacion")
        : withDashboardBase("/dashboard/calendar");

  const cards = [
    {
      label: "Turnos hoy",
      value: summary.appointmentsCount,
      icon: CalendarDays,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      label: "Notificaciones",
      value: notificationCard.value,
      hint: notificationCard.hint,
      icon: Bell,
      color: "text-indigo-600",
      bg: "bg-indigo-500/10",
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

  const cardHrefByLabel: Record<string, string> = {
    "Turnos hoy": withDashboardBase("/dashboard/calendar"),
    Notificaciones: notificationHref,
    "Alertas de stock": withDashboardBase("/dashboard/inventory"),
    "Crecimiento": withDashboardBase("/dashboard/business#estadisticas"),
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
  const randomSocialTag = SOCIAL_TAGS[Math.floor(Math.random() * SOCIAL_TAGS.length)];

  return (
    <div className="space-y-6">
      {(shopSlugOverride || summary.shopSlug) && voucherAlertsResult.success && (voucherAlertsResult.data?.length || 0) > 0 && (
        <VoucherBirthdayAlert shopSlug={shopSlugOverride || summary.shopSlug} items={voucherAlertsResult.data || []} />
      )}
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white capitalize tracking-tight">
            {today}
          </h1>
          <div className="mt-3 flex min-w-0 items-center gap-2 overflow-hidden">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full w-9 h-9 text-white"
              aria-label="Abrir WhatsApp"
              title="WhatsApp"
              style={{
                background: "linear-gradient(135deg, #7bcfa3 0%, #69bb93 100%)",
                boxShadow: "0 8px 18px rgba(105,187,147,0.22), inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden="true">
                <path d="M12.04 2C6.53 2 2.06 6.47 2.06 11.98c0 1.94.55 3.83 1.6 5.46L2 22l4.72-1.63a9.93 9.93 0 0 0 5.32 1.54h.01c5.51 0 9.98-4.47 9.98-9.98A9.98 9.98 0 0 0 12.04 2Zm5.82 14.25c-.24.68-1.39 1.3-1.92 1.38-.49.07-1.12.1-1.81-.12-.42-.13-.95-.31-1.64-.61-2.88-1.25-4.76-4.16-4.91-4.36-.15-.2-1.17-1.56-1.17-2.97 0-1.41.74-2.1 1-2.39.26-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2.01.9 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.47-.14.17-.3.37-.43.49-.14.14-.29.3-.12.59.17.29.77 1.27 1.64 2.05 1.13 1.01 2.08 1.32 2.37 1.47.29.14.46.12.63-.07.17-.19.73-.85.92-1.14.19-.29.39-.24.66-.14.27.1 1.72.81 2.01.96.29.14.48.22.55.34.07.12.07.68-.17 1.36Z" />
              </svg>
            </a>
            {instagramHref && (
              <a href={instagramHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full w-9 h-9 text-white bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 shadow-sm" aria-label="Abrir Instagram" title="Instagram">
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5Zm9.15 1.35a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" /></svg>
              </a>
            )}
            {facebookHref && (
              <a href={facebookHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full w-9 h-9 text-white bg-[#1877F2] shadow-sm" aria-label="Abrir Facebook" title="Facebook">
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.6-1.6h1.7V4.8c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4V11H8v3h2.6v8h2.9Z" /></svg>
              </a>
            )}
            {tiktokHref && (
              <a href={tiktokHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full w-9 h-9 text-white bg-black shadow-sm" aria-label="Abrir TikTok" title="TikTok">
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden="true"><path d="M14.5 3c.2 1.9 1.3 3.5 3.1 4.2.8.3 1.6.5 2.4.5v2.6c-1.8 0-3.7-.5-5.2-1.5v6.1c0 3.1-2.5 5.6-5.6 5.6S3.6 18 3.6 14.9s2.5-5.6 5.6-5.6c.3 0 .6 0 .9.1V12c-.3-.1-.6-.2-.9-.2-1.7 0-3.1 1.4-3.1 3.1S7.5 18 9.2 18s3.1-1.4 3.1-3.1V3h2.2Z" /></svg>
              </a>
            )}
            <span
              className="social-tag-hero ml-2 sm:ml-3 min-w-0 max-w-[34vw] sm:max-w-[260px] truncate text-[1rem] sm:text-[2rem] leading-none font-medium tracking-[-0.02em] select-none"
              style={{
                backgroundImage:
                  "linear-gradient(112deg, rgba(15,23,42,0.9) 0%, rgba(71,85,105,0.82) 32%, rgba(59,130,246,0.74) 62%, rgba(125,211,252,0.8) 78%, rgba(14,165,233,0.68) 100%)",
                backgroundSize: "180% 100%",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                textShadow: "0 10px 28px rgba(15,23,42,0.12)",
                transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), filter 260ms cubic-bezier(0.22, 1, 0.36, 1), background-position 520ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {randomSocialTag}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Resumen de tu peluquería
          </p>
        </div>
        <div className="hidden lg:block pt-0.5">
          <p className="dashboard-shopname-hero text-4xl xl:text-5xl font-black tracking-[-0.04em] text-gray-900/80 dark:text-white/85 max-w-[34rem] truncate text-right">
            {summary.shopName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, hint, icon: Icon, color, bg }, idx) => {
          const isGrowthCard = label === "Crecimiento";
          const growthFill = growthValue === null ? 18 : Math.min(Math.max(Math.abs(growthValue), 8), 100);
          const hasProgress = isGrowthCard;
          const sheenStyle: CSSProperties & Record<"--sheen-delay" | "--sheen-duration", string> = {
            "--sheen-delay": `${-0.5 - idx * 2.1}s`,
            "--sheen-duration": `${13.6 + (idx % 3) * 0.8}s`,
          };
          return (
          <HoverScale key={label}>
            <Link href={cardHrefByLabel[label] || dashboardBasePath} className="block h-full">
              <div
                className="glass-sheen-card h-full min-h-[124px] lg:min-h-[132px] bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4 transition-colors hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer"
                style={sheenStyle}
              >
                <div className={`p-3 rounded-xl ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="relative z-10 flex-1 min-w-0 flex flex-col">
                  <p className="text-sm text-gray-500 dark:text-zinc-400">{label}</p>
                  <p className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">{value}</p>
                  {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">{hint}</p>}
                  {isGrowthCard && (
                    <div className="mt-2.5">
                      <div className="h-2 w-full rounded-full bg-zinc-200/70 dark:bg-zinc-700/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full flow-mini ${growthValue === null || growthValue >= 0 ? "flow-mini-pos" : "flow-mini-neg"}`}
                          style={{ width: `${growthFill}%` }}
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
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 min-w-0">
          <RevenueChart data={metrics?.revenueChart ?? []} flowByPeriod={metrics?.flowByPeriod} />
        </div>
        <div className="lg:col-span-1 space-y-4 min-w-0">
          <TopServices data={metrics?.topServices ?? []} serviceLabelPlural={servicePlural} />
          <MonthlyGrowthCard clientsData={metrics?.monthlyGrowth ?? []} revenueData={metrics?.revenueChart ?? []} />
        </div>
      </div>

      <div className="glass-sheen-card bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
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
                        phone: appt.customers?.telefono ?? null,
                        customerName: clientName,
                        serviceName: appt.services?.name,
                        time: start.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
                        template: whatsappTemplate,
                        shopName: summary.shopName,
                      });
                      if (waUrl) {
                        return (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center justify-center gap-1 p-2 rounded-full text-white transition-all shadow-sm"
                            style={{
                              background: "linear-gradient(135deg, #7bcfa3 0%, #69bb93 100%)",
                              boxShadow: "0 8px 18px rgba(105,187,147,0.22), inset 0 1px 0 rgba(255,255,255,0.35)",
                              backdropFilter: "blur(10px)",
                              WebkitBackdropFilter: "blur(10px)",
                            }}
                            title="Enviar Recordatorio"
                            data-cursor="enviar"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span className="max-w-0 group-hover:max-w-[130px] overflow-hidden text-[10px] font-medium leading-none transition-all duration-200 whitespace-nowrap">Enviar Recordatorio</span>
                          </a>
                        );
                      }

                      return (
                        <span
                          className="inline-flex items-center justify-center p-2 rounded-full border border-zinc-300/70 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500"
                          title="WhatsApp no disponible: falta teléfono o plantilla inválida"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ShareLinkCard slug={shopSlugOverride || summary.shopSlug} />
      <PwaInstallButton />
      <style>{`
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
          animation: socialTagReveal 680ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, filter, background-position;
        }
        .social-tag-hero:hover {
          transform: translateY(-1px) scale(1.01);
          filter: saturate(1.06);
          background-position: 82% 0;
        }
        @keyframes socialTagReveal {
          from { opacity: 0; transform: translate3d(10px, 0, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
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
    redirect("/landing");
  }

  const { data: shop } = await admin
    .from("shops")
    .select("slug")
    .eq("id", firstShopId)
    .maybeSingle();

  if (!shop?.slug) {
    redirect("/landing");
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
    .single();
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
