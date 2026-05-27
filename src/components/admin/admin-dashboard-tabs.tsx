"use client";

import { useState } from "react";
import type { AdminAnalytics } from "@/lib/admin/analytics";
import type { GrowthMetrics } from "@/lib/analytics/growth-metrics";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { StatePanel } from "@/components/ui/state-panel";

type AdminTab = "resumen" | "crecimiento" | "operacion" | "top";

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function deltaPct(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return "0%";
    return "+100%";
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function ratioPct(value: number, total: number) {
  if (total <= 0) return "0.00%";
  return `${((value / total) * 100).toFixed(2)}%`;
}

function StatCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-4 shadow-sm shadow-zinc-200/40">
      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm shadow-zinc-200/50">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function AdminDashboardTabs({
  analytics,
  growth,
  initialTab,
}: {
  analytics: AdminAnalytics;
  growth: GrowthMetrics;
  initialTab: AdminTab;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 px-6 py-7 text-zinc-100 shadow-xl shadow-zinc-900/20">
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-20 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-300">Panel superadmin</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Vista ejecutiva de negocio</h2>
            <p className="mt-1 text-sm text-zinc-300">Actualizado: {new Date(analytics.generatedAt).toLocaleString("es-AR")}</p>
          </div>
          <a
            href="/admin/referrals"
            className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
          >
            Ver referidos y comisiones
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white/95 p-2 shadow-sm shadow-zinc-200/40" aria-label="Secciones del panel">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="tablist" aria-orientation="horizontal">
          {([
            ["resumen", "Resumen"],
            ["crecimiento", "Crecimiento"],
            ["operacion", "Operación"],
            ["top", "Top negocios"],
          ] as const).map(([tabKey, label]) => {
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tabKey}`}
                id={`tab-${tabKey}`}
                className={`rounded-xl px-3 py-2 text-center text-sm font-semibold transition ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === "resumen" ? (
        <div role="tabpanel" id="panel-resumen" aria-labelledby="tab-resumen">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Locales totales" value={analytics.totals.totalShops} />
            <StatCard
              title="Locales activos"
              value={analytics.totals.activeShops}
              hint={`Inactivos: ${analytics.totals.inactiveShops} · Activos ${ratioPct(analytics.totals.activeShops, analytics.totals.totalShops)}`}
            />
            <StatCard title="Locales creados (30d)" value={analytics.totals.shopsCreated30d} hint={`7d: ${analytics.totals.shopsCreated7d}`} />
            <StatCard
              title="Ingresos suscripciones (30d)"
              value={money(analytics.totals.revenue30d)}
              hint={`Pagos 30d: ${analytics.totals.payments30d}`}
            />
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="MRR estimado" value={money(analytics.totals.mrrEstimated)} hint={`ARPU activo 30d: ${money(analytics.totals.arpuActive30d)}`} />
            <StatCard title="Locales por vencer (7d)" value={analytics.totals.shopsExpiring7d} hint={`Vencidos/inactivos: ${analytics.totals.shopsExpiredOrInactive}`} />
            <StatCard title="Turnos 30d" value={analytics.totals.totalAppointments30d} hint={`Completados: ${analytics.totals.completedAppointments30d}`} />
            <StatCard title="Base operativa" value={analytics.totals.totalServices} hint={`Clientes: ${analytics.totals.totalCustomers} · Staff: ${analytics.totals.totalStaff}`} />
          </section>
        </div>
      ) : null}

      {activeTab === "crecimiento" ? (
        <div role="tabpanel" id="panel-crecimiento" aria-labelledby="tab-crecimiento">
        <SectionCard title="Crecimiento y retención" description={`Product events en últimos ${growth.lookbackDays} días.`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Activación D7" value={`${growth.activation.activationRateD7Pct}%`} hint={`${growth.activation.activatedD7} activados sobre ${growth.cohort.trialStarted} trials`} />
            <StatCard title="Churn 30d" value={`${growth.retention.churnRate30dPct}%`} hint={`${growth.retention.churnedShops30d} bajas / ${growth.retention.paidShops30d} pagos 30d`} />
            <StatCard title="Trial a pago" value={`${growth.conversion.trialToPaidPct}%`} hint={`${growth.conversion.trialToPaid} con pago sobre ${growth.cohort.trialStarted} trials`} />
            <StatCard title="Cohorte trial" value={growth.cohort.trialStarted} hint={`${growth.cohort.paid} locales con pago historico`} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full min-w-[760px] text-sm" aria-label="Embudo de crecimiento">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Paso funnel</th>
                  <th className="px-2 py-2">Locales</th>
                  <th className="px-2 py-2">Conv. desde trial</th>
                </tr>
              </thead>
              <tbody>
                {[["trial_started", growth.funnel.trial_started], ["first_staff_added", growth.funnel.first_staff_added], ["first_service_published", growth.funnel.first_service_published], ["first_booking_confirmed", growth.funnel.first_booking_confirmed], ["subscription_paid", growth.funnel.subscription_paid]].map(([step, value]) => (
                  <tr key={step} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2 font-medium">{step}</td>
                    <td className="px-2 py-2">{value}</td>
                    <td className="px-2 py-2">{ratioPct(Number(value), growth.cohort.trialStarted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {growth.cohort.trialStarted === 0 ? (
            <div className="mt-3">
              <StatePanel title="Sin datos de cohorte" description="Todavía no hay trials iniciados en la ventana seleccionada." />
            </div>
          ) : null}
        </SectionCard>
        </div>
      ) : null}

      {activeTab === "operacion" ? (
        <div role="tabpanel" id="panel-operacion" aria-labelledby="tab-operacion">
          <SectionCard title="Rendimiento por rubro" description="Lectura comparativa de volumen, ingresos y riesgo de churn.">
            <div className="overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full min-w-[980px] text-sm" aria-label="Rendimiento por rubro">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-2 py-2">Rubro</th><th className="px-2 py-2">Locales</th><th className="px-2 py-2">Activos</th><th className="px-2 py-2">Inactivos</th><th className="px-2 py-2">Nuevos 30d</th><th className="px-2 py-2">Pagos 30d</th><th className="px-2 py-2">Ingresos 30d</th><th className="px-2 py-2">ARPU 30d</th><th className="px-2 py-2">Riesgo churn</th><th className="px-2 py-2">Conv. a 1er pago</th><th className="px-2 py-2">Dias prom. a 1er pago</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.byIndustry.map((row) => (
                    <tr key={row.industry} className="border-b border-zinc-100 last:border-0">
                      <td className="px-2 py-2 font-medium">{INDUSTRY_CONFIG[row.industry].displayName}</td><td className="px-2 py-2">{row.totalShops}</td><td className="px-2 py-2">{row.activeShops}</td><td className="px-2 py-2">{row.inactiveShops}</td><td className="px-2 py-2">{row.shopsCreated30d}</td><td className="px-2 py-2">{row.payments30d}</td><td className="px-2 py-2">{money(row.revenue30d)}</td><td className="px-2 py-2">{money(row.arpu30d)}</td><td className="px-2 py-2">{row.churnRiskShops}</td><td className="px-2 py-2">{row.conversionToFirstPaymentPct}%</td><td className="px-2 py-2">{row.avgDaysToFirstPayment ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analytics.byIndustry.length === 0 ? (
              <div className="mt-3">
                <StatePanel title="Sin rubros para mostrar" description="No hay datos de rubros disponibles todavía." />
              </div>
            ) : null}
          </SectionCard>
          <SectionCard title="Dato estratégico rápido">
            <p className="mt-2 text-sm text-zinc-600">
              Ingresos históricos estimados por suscripción: <span className="font-semibold text-zinc-900">{money(analytics.totals.revenueAllTime)}</span>.
            </p>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "top" ? (
        <div role="tabpanel" id="panel-top" aria-labelledby="tab-top">
        <SectionCard title="Top negocios" description="Ordenado por ingresos de suscripción en 30 días.">
          <div className="overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full min-w-[1180px] text-sm" aria-label="Top negocios por ingresos">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Negocio</th><th className="px-2 py-2">Rubro</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Dias a vencimiento</th><th className="px-2 py-2">Pagos 30d</th><th className="px-2 py-2">Ingresos 30d</th><th className="px-2 py-2">Turnos 30d</th><th className="px-2 py-2">Completados 30d</th><th className="px-2 py-2">Servicios</th><th className="px-2 py-2">Clientes</th><th className="px-2 py-2">Staff</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topShopsByRevenue30d.map((shop) => (
                  <tr key={shop.shopId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2"><p className="font-medium">{shop.shopName}</p><p className="text-xs text-zinc-500">/{shop.shopSlug}</p></td>
                    <td className="px-2 py-2">{INDUSTRY_CONFIG[shop.industry].displayName}</td><td className="px-2 py-2">{shop.active ? "Activo" : "Inactivo"}</td><td className="px-2 py-2">{shop.daysToExpiry ?? "-"}</td><td className="px-2 py-2">{shop.payments30d}</td><td className="px-2 py-2">{money(shop.revenue30d)}</td><td className="px-2 py-2">{shop.appointments30d}</td><td className="px-2 py-2">{shop.completedAppointments30d}</td><td className="px-2 py-2">{shop.servicesCount}</td><td className="px-2 py-2">{shop.customersCount}</td><td className="px-2 py-2">{shop.staffCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analytics.topShopsByRevenue30d.length === 0 ? (
            <div className="mt-3">
              <StatePanel title="Sin negocios en el ranking" description="Cuando haya datos de pagos e ingresos aparecerán aquí." />
            </div>
          ) : null}
        </SectionCard>
        </div>
      ) : null}

      {activeTab === "resumen" ? (
        <SectionCard title="Tendencias 7 / 30 / 90 días" description="Comparado contra la ventana inmediatamente anterior de igual duración.">
          <div className="overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full min-w-[980px] text-sm" aria-label="Tendencias por ventana">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Ventana</th><th className="px-2 py-2">Locales nuevos</th><th className="px-2 py-2">Pagos</th><th className="px-2 py-2">Ingresos</th><th className="px-2 py-2">Turnos</th><th className="px-2 py-2">Completados</th>
                </tr>
              </thead>
              <tbody>
                {analytics.trends.map((trend) => (
                  <tr key={trend.windowDays} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2 font-medium">{trend.windowDays} dias</td><td className="px-2 py-2">{trend.shopsCreated} <span className="text-xs text-zinc-500">({deltaPct(trend.shopsCreated, trend.shopsCreatedPrevWindow)})</span></td><td className="px-2 py-2">{trend.payments} <span className="text-xs text-zinc-500">({deltaPct(trend.payments, trend.paymentsPrevWindow)})</span></td><td className="px-2 py-2">{money(trend.revenue)} <span className="text-xs text-zinc-500">({deltaPct(trend.revenue, trend.revenuePrevWindow)})</span></td><td className="px-2 py-2">{trend.appointments} <span className="text-xs text-zinc-500">({deltaPct(trend.appointments, trend.appointmentsPrevWindow)})</span></td><td className="px-2 py-2">{trend.completedAppointments} <span className="text-xs text-zinc-500">({deltaPct(trend.completedAppointments, trend.completedAppointmentsPrevWindow)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analytics.trends.length === 0 ? (
            <div className="mt-3">
              <StatePanel title="Sin tendencias disponibles" description="Aún no hay suficientes datos para construir tendencias." />
            </div>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
