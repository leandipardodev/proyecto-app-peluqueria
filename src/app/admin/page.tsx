import { fetchAdminAnalytics } from "@/lib/admin/analytics";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";

export const dynamic = "force-dynamic";

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

export default async function AdminPage() {
  const analytics = await fetchAdminAnalytics();

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-end">
        <a href="/admin/referrals" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
          Ver referidos y comisiones
        </a>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Resumen general</h2>
        <p className="mt-1 text-sm text-zinc-500">Actualizado: {new Date(analytics.generatedAt).toLocaleString("es-AR")}</p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Locales totales</p>
          <p className="mt-1 text-2xl font-semibold">{analytics.totals.totalShops}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Locales activos</p>
          <p className="mt-1 text-2xl font-semibold">{analytics.totals.activeShops}</p>
          <p className="text-xs text-zinc-500">Inactivos: {analytics.totals.inactiveShops}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Locales creados (30d)</p>
          <p className="mt-1 text-2xl font-semibold">{analytics.totals.shopsCreated30d}</p>
          <p className="text-xs text-zinc-500">7d: {analytics.totals.shopsCreated7d}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Ingresos suscripciones (30d)</p>
          <p className="mt-1 text-2xl font-semibold">{money(analytics.totals.revenue30d)}</p>
          <p className="text-xs text-zinc-500">Pagos 30d: {analytics.totals.payments30d}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">MRR estimado</p>
          <p className="mt-1 text-2xl font-semibold">{money(analytics.totals.mrrEstimated)}</p>
          <p className="text-xs text-zinc-500">ARPU activo 30d: {money(analytics.totals.arpuActive30d)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Locales por vencer (7d)</p>
          <p className="mt-1 text-2xl font-semibold">{analytics.totals.shopsExpiring7d}</p>
          <p className="text-xs text-zinc-500">Vencidos/inactivos: {analytics.totals.shopsExpiredOrInactive}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Turnos 30d</p>
          <p className="mt-1 text-2xl font-semibold">{analytics.totals.totalAppointments30d}</p>
          <p className="text-xs text-zinc-500">Completados: {analytics.totals.completedAppointments30d}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Base operativa</p>
          <p className="mt-1 text-sm font-semibold">Servicios: {analytics.totals.totalServices}</p>
          <p className="text-xs text-zinc-500">Clientes/Pacientes: {analytics.totals.totalCustomers}</p>
          <p className="text-xs text-zinc-500">Staff total: {analytics.totals.totalStaff}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Rendimiento por rubro</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Rubro</th>
                <th className="px-2 py-2">Locales</th>
                <th className="px-2 py-2">Activos</th>
                <th className="px-2 py-2">Inactivos</th>
                <th className="px-2 py-2">Nuevos 30d</th>
                <th className="px-2 py-2">Pagos 30d</th>
                <th className="px-2 py-2">Ingresos 30d</th>
                <th className="px-2 py-2">ARPU 30d</th>
                <th className="px-2 py-2">Riesgo churn</th>
                <th className="px-2 py-2">Conv. a 1er pago</th>
                <th className="px-2 py-2">Dias prom. a 1er pago</th>
              </tr>
            </thead>
            <tbody>
              {analytics.byIndustry.map((row) => (
                <tr key={row.industry} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2 py-2 font-medium">{INDUSTRY_CONFIG[row.industry].displayName}</td>
                  <td className="px-2 py-2">{row.totalShops}</td>
                  <td className="px-2 py-2">{row.activeShops}</td>
                  <td className="px-2 py-2">{row.inactiveShops}</td>
                  <td className="px-2 py-2">{row.shopsCreated30d}</td>
                  <td className="px-2 py-2">{row.payments30d}</td>
                  <td className="px-2 py-2">{money(row.revenue30d)}</td>
                  <td className="px-2 py-2">{money(row.arpu30d)}</td>
                  <td className="px-2 py-2">{row.churnRiskShops}</td>
                  <td className="px-2 py-2">{row.conversionToFirstPaymentPct}%</td>
                  <td className="px-2 py-2">{row.avgDaysToFirstPayment ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Tendencias 7 / 30 / 90 dias</h3>
        <p className="mt-1 text-sm text-zinc-500">Comparado contra la ventana inmediatamente anterior de igual duracion.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Ventana</th>
                <th className="px-2 py-2">Locales nuevos</th>
                <th className="px-2 py-2">Pagos</th>
                <th className="px-2 py-2">Ingresos</th>
                <th className="px-2 py-2">Turnos</th>
                <th className="px-2 py-2">Completados</th>
              </tr>
            </thead>
            <tbody>
              {analytics.trends.map((trend) => (
                <tr key={trend.windowDays} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2 py-2 font-medium">{trend.windowDays} dias</td>
                  <td className="px-2 py-2">
                    {trend.shopsCreated} <span className="text-xs text-zinc-500">({deltaPct(trend.shopsCreated, trend.shopsCreatedPrevWindow)})</span>
                  </td>
                  <td className="px-2 py-2">
                    {trend.payments} <span className="text-xs text-zinc-500">({deltaPct(trend.payments, trend.paymentsPrevWindow)})</span>
                  </td>
                  <td className="px-2 py-2">
                    {money(trend.revenue)} <span className="text-xs text-zinc-500">({deltaPct(trend.revenue, trend.revenuePrevWindow)})</span>
                  </td>
                  <td className="px-2 py-2">
                    {trend.appointments} <span className="text-xs text-zinc-500">({deltaPct(trend.appointments, trend.appointmentsPrevWindow)})</span>
                  </td>
                  <td className="px-2 py-2">
                    {trend.completedAppointments} <span className="text-xs text-zinc-500">({deltaPct(trend.completedAppointments, trend.completedAppointmentsPrevWindow)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Dato estratégico rápido</h3>
        <p className="mt-2 text-sm text-zinc-600">
          Ingresos históricos estimados por suscripción: <span className="font-semibold text-zinc-900">{money(analytics.totals.revenueAllTime)}</span>.
          Este valor sale de eventos <code>subscription_payment_applied</code> y precio mensual actual.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Top negocios (por ingresos 30d)</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Negocio</th>
                <th className="px-2 py-2">Rubro</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2">Dias a vencimiento</th>
                <th className="px-2 py-2">Pagos 30d</th>
                <th className="px-2 py-2">Ingresos 30d</th>
                <th className="px-2 py-2">Turnos 30d</th>
                <th className="px-2 py-2">Completados 30d</th>
                <th className="px-2 py-2">Servicios</th>
                <th className="px-2 py-2">Clientes</th>
                <th className="px-2 py-2">Staff</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topShopsByRevenue30d.map((shop) => (
                <tr key={shop.shopId} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2 py-2">
                    <p className="font-medium">{shop.shopName}</p>
                    <p className="text-xs text-zinc-500">/{shop.shopSlug}</p>
                  </td>
                  <td className="px-2 py-2">{INDUSTRY_CONFIG[shop.industry].displayName}</td>
                  <td className="px-2 py-2">{shop.active ? "Activo" : "Inactivo"}</td>
                  <td className="px-2 py-2">{shop.daysToExpiry ?? "-"}</td>
                  <td className="px-2 py-2">{shop.payments30d}</td>
                  <td className="px-2 py-2">{money(shop.revenue30d)}</td>
                  <td className="px-2 py-2">{shop.appointments30d}</td>
                  <td className="px-2 py-2">{shop.completedAppointments30d}</td>
                  <td className="px-2 py-2">{shop.servicesCount}</td>
                  <td className="px-2 py-2">{shop.customersCount}</td>
                  <td className="px-2 py-2">{shop.staffCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
