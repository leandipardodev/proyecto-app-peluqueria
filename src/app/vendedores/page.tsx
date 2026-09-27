import Link from "next/link";
import { redirect } from "next/navigation";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import { logoutPartnerAction } from "@/app/vendedores/actions";
import {
  getPartnerDashboard,
  getPartnerSession,
} from "@/lib/referrals/partner-portal";

export const dynamic = "force-dynamic";

function formatArs(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(
    new Date(value),
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-zinc-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

export default async function PartnerDashboardPage() {
  const session = await getPartnerSession();
  if (!session) redirect("/vendedores/acceso");

  const dashboard = await getPartnerDashboard(session.partnerId);
  if (!dashboard) redirect("/vendedores/acceso");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Panel de vendedor</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">
              {dashboard.partnerName}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-300">
              Tu código: <span className="font-mono">{dashboard.referralCode}</span> ·{" "}
              {dashboard.commissionPercent}% de lo que recibimos por los primeros{" "}
              {dashboard.commissionMonths} pagos de cada local
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/r/${dashboard.referralCode}`}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Ver mi link
            </Link>
            <form action={logoutPartnerAction}>
              <button
                type="submit"
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Salir
              </button>
            </form>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Locales" value={String(dashboard.totals.shops)} />
          <Card
            label="Pagos contados"
            value={String(dashboard.totals.monthsPaid)}
            hint={`de ${dashboard.commissionMonths} por local`}
          />
          <Card label="Generado" value={formatArs(dashboard.totals.commissionGenerated)} />
          <Card
            label="Pendiente de pago"
            value={formatArs(dashboard.totals.commissionPending)}
            hint={`Pagado: ${formatArs(dashboard.totals.commissionPaid)}`}
          />
        </div>

        <section className="rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-semibold text-gray-900 dark:border-zinc-800 dark:text-zinc-100">
            Mis locales
          </h2>

          {dashboard.shops.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-600 dark:text-zinc-300">
              Todavía no tenés locales. Compartí tu link para empezar.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-zinc-800">
              {dashboard.shops.map((shop) => (
                <li key={shop.shopId} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-gray-900 dark:text-zinc-100">{shop.shopName}</p>
                    <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                      {formatArs(shop.commissionPending)}
                      <span className="ml-1 font-normal text-gray-500 dark:text-zinc-400">
                        pendiente
                      </span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    {shop.paymentsTracked} de {shop.commissionMonths} pagos · {shop.commissionPercent}% ·
                    atribuido el {formatDate(shop.attributedAt)} · generado {formatArs(shop.commissionGenerated)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {dashboard.lostShops.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
            <h2 className="border-b border-amber-200 px-5 py-4 text-sm font-semibold text-amber-900 dark:border-amber-900/40 dark:text-amber-200">
              Locales que se te escaparon
            </h2>
            <ul className="divide-y divide-amber-200 dark:divide-amber-900/40">
              {dashboard.lostShops.map((shop) => (
                <li key={shop.shopId} className="px-5 py-3 text-sm text-amber-900 dark:text-amber-200">
                  {shop.shopName} ya fue asignado a {shop.takenByName}. Un local puede quedar con un solo
                  vendedor, el primero que llegó.
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Datos de cobro</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-300">
            Klip te transfiere una vez por local y por mes. No se cobra desde esta página.
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                Alias
              </dt>
              <dd className="mt-1 font-mono text-sm text-gray-900 dark:text-zinc-100">
                {dashboard.payoutAlias || "Cargalo con Klip"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                CBU
              </dt>
              <dd className="mt-1 font-mono text-sm text-gray-900 dark:text-zinc-100">
                {dashboard.payoutCbu || "Cargalo con Klip"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-gray-500 dark:text-zinc-400">
            Los carga Klip. Si están mal o querés cambiarlos, pedí que los actualicen.
          </p>
        </section>

        <p className="text-center text-xs text-gray-400 dark:text-zinc-600">
          Datos actualizados al {formatDate(dashboard.generatedAt)} (hora Argentina) · hoy es{" "}
          {getArgentinaDateKey(new Date())}
        </p>
      </div>
    </div>
  );
}
