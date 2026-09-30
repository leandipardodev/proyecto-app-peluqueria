import { redirect } from "next/navigation";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import { getPublicBaseUrl } from "@/lib/urls";
import { logoutPartnerAction } from "@/app/vendedores/actions";
import { getPartnerDashboard, getPartnerSession, type PartnerPortalShop } from "@/lib/referrals/partner-portal";
import PartnerShare from "@/components/referrals/partner-share";
import PartnerPayoutForm from "@/components/referrals/partner-payout-form";
import { Building2, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

function formatArs(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(
    new Date(value),
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums dark:text-white">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

/**
 * Estado del local segun cuantos pagos comisionables ya consumio.
 *
 * El partner ve "x/2" siempre: es la regla del programa. El estado agrega si
 * todavia no arranco a pagar (esta en prueba) o si ya termino de generar
 * comision, que es cuando un local deja de valerle al vendedor.
 */
function shopStage(shop: PartnerPortalShop) {
  if (shop.paymentsTracked === 0) {
    return { label: "En prueba", tone: "text-amber-600 dark:text-amber-400" };
  }
  if (shop.paymentsTracked >= shop.commissionMonths) {
    return { label: "Comisión completa", tone: "text-emerald-600 dark:text-emerald-400" };
  }
  return { label: "Cobrando", tone: "text-sky-600 dark:text-sky-400" };
}

function ShopTile({ shop }: { shop: PartnerPortalShop }) {
  const stage = shopStage(shop);
  return (
    <li className="group relative flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-3.5 transition hover:border-zinc-300 hover:shadow-sm dark:border-white/5 dark:bg-white/[0.03] dark:hover:border-white/10">
      <div className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition group-hover:text-zinc-400 dark:text-zinc-700 dark:group-hover:text-zinc-600" />
        <span className={`truncate text-[11px] font-medium ${stage.tone}`}>{stage.label}</span>
      </div>

      <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
        {shop.shopName}
      </p>

      <p className="mt-1.5 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-400">
        {shop.paymentsTracked} de {shop.commissionMonths} meses
      </p>

      {shop.commissionPending > 0 ? (
        <p className="mt-2 text-sm font-semibold text-zinc-900 tabular-nums dark:text-white">
          {formatArs(shop.commissionPending)}
          <span className="ml-1 text-[11px] font-normal text-zinc-400 dark:text-zinc-400">pendiente</span>
        </p>
      ) : shop.commissionPaid > 0 ? (
        <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {formatArs(shop.commissionPaid)}
          <span className="ml-1 text-[11px] font-normal text-zinc-400 dark:text-zinc-400">cobrado</span>
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-300 dark:text-zinc-700">Sin comisión aún</p>
      )}
    </li>
  );
}

export default async function PartnerDashboardPage() {
  const session = await getPartnerSession();
  if (!session) redirect("/vendedores/acceso");

  const dashboard = await getPartnerDashboard(session.partnerId);
  if (!dashboard) redirect("/vendedores/acceso");

  return (
    <div className="min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-400">
              Panel de vendedor
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
              {dashboard.partnerName}
            </h1>
            <p className="mt-2 max-w-md text-sm font-light leading-relaxed text-zinc-500 dark:text-zinc-400">
              Te corresponde el {dashboard.commissionPercent}% de lo que Klip recibe por cada local, durante los
              primeros {dashboard.commissionMonths} pagos.
            </p>
          </div>

          <form action={logoutPartnerAction} className="shrink-0">
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-white/60 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200"
            >
              Salir
            </button>
          </form>
        </header>

        <div className="mt-8">
          <PartnerShare
            referralCode={dashboard.referralCode}
            baseUrl={getPublicBaseUrl()}
            partnerName={dashboard.partnerName}
            commissionPercent={dashboard.commissionPercent}
            commissionMonths={dashboard.commissionMonths}
          />
        </div>

        <div className="mt-12 grid grid-cols-3 gap-6 border-y border-zinc-200/70 py-6 dark:border-white/5">
          <Stat label="Locales" value={String(dashboard.totals.shops)} />
          <Stat label="Pendiente" value={formatArs(dashboard.totals.commissionPending)} />
          <Stat
            label="Generado"
            value={formatArs(dashboard.totals.commissionGenerated)}
            hint={`${formatArs(dashboard.totals.commissionPaid)} cobrado`}
          />
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            {dashboard.shops.length === 0 ? "Todavía no tenés locales" : "Tus locales"}
          </h2>
          <p className="mt-1 text-sm font-light text-zinc-500 dark:text-zinc-400">
            {dashboard.shops.length === 0
              ? "Compartí tu link y cada peluquería que se registre suma meses de comisión."
              : `${dashboard.shops.length} ${dashboard.shops.length === 1 ? "local cuenta" : "locales cuentan"} con comisión para vos.`}
          </p>

          {dashboard.shops.length === 0 ? null : (
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {dashboard.shops.map((shop) => (
                <ShopTile key={shop.shopId} shop={shop} />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12 border-t border-zinc-200/70 pt-8 dark:border-white/5">
          <PartnerPayoutForm
            payoutAlias={dashboard.payoutAlias}
            payoutCbu={dashboard.payoutCbu}
            trigger={
              <button
                type="button"
                className="group flex w-full items-center justify-between rounded-3xl px-1 py-2 text-left transition hover:opacity-70"
              >
                <span>
                  <span className="block text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                    Datos de cobro
                  </span>
                  <span className="mt-0.5 block text-sm font-light text-zinc-500 dark:text-zinc-400">
                    {dashboard.payoutAlias || dashboard.payoutCbu
                      ? "Revisar o cambiar alias y CBU"
                      : "Cargá tu alias o CBU para que Klip te pueda transferir"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 dark:text-zinc-700" />
              </button>
            }
          />
        </section>

        {dashboard.payouts.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">Te transfirieron</h2>
            <ul className="mt-4 divide-y divide-zinc-200/70 dark:divide-white/5">
              {dashboard.payouts.map((payout) => (
                <li key={payout.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {payout.paidAt ? formatDate(payout.paidAt) : "Sin fecha"}
                  </span>
                  <span className="font-semibold text-zinc-900 tabular-nums dark:text-white">
                    {formatArs(payout.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/*
          Los locales que otro vendedor se quedo quedan al pie y plegados: es la
          parte que mas soporte genera y no cambia lo que el vendedor tiene que
          hacer. El registro se sigue guardando, asi que si alguno reclama, Klip
          puede explicar la regla sin reconstruirla.
        */}
        {dashboard.lostShops.length > 0 ? (
          <details className="mt-12 border-t border-zinc-200/70 pt-6 dark:border-white/5">
            <summary className="cursor-pointer text-sm text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              ¿Por qué no están todos los locales que traje?
            </summary>
            <ul className="mt-4 space-y-2">
              {dashboard.lostShops.map((shop) => (
                <li key={shop.shopId} className="text-sm font-light text-zinc-500 dark:text-zinc-400">
                  {shop.shopName} ya fue asignado a {shop.takenByName}. Un local puede quedar con un solo
                  vendedor, el primero que llegó.
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <p className="mt-12 text-center text-xs font-light text-zinc-300 dark:text-zinc-600">
          Actualizado al {formatDate(dashboard.generatedAt)} · hoy es {getArgentinaDateKey(new Date())}
        </p>
      </div>
    </div>
  );
}
