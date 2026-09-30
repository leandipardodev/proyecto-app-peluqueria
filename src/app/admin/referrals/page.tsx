import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPublicBaseUrl } from "@/lib/urls";
import {
 assignReferralToShop,
 deleteReferralAttribution,
 fetchReferralsAdminOverview,
 syncReferralLedgerInternal,
 updateReferralProgramSettings,
 upsertReferralPartner,
} from "@/lib/admin/referrals";
import PartnerCard from "@/components/admin/referrals/partner-card";
import PartnerOnboarding from "@/components/admin/referrals/partner-onboarding";
import ShopTile from "@/components/admin/referrals/shop-tile";
import TransferList from "@/components/admin/referrals/transfer-list";
import NeedsReviewList from "@/components/admin/referrals/needs-review-list";
import { Link as LinkIcon, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * El ledger se armaba solo con el cron de las 7am, asi que un pago del lunes a
 * las 14 no aparecia en el panel hasta el martes: casi 24h de atraso para leer un
 * numero que el webhook ya conocia. Ahora se sincroniza al abrir el panel.
 *
 * El throttle es best-effort (en serverless cada instancia tiene su propio
 * reloj) pero no importa: el upsert es idempotente por `billing_event_id`, asi
 * que sincronizar de mas solo cuesta una consulta, nunca duplica comisiones.
 */
let lastSyncAt = 0;
const SYNC_THROTTLE_MS = 60_000;

async function syncIfStale() {
 const now = Date.now();
 if (now - lastSyncAt < SYNC_THROTTLE_MS) return;
 lastSyncAt = now;
 try {
 await syncReferralLedgerInternal();
 } catch {
 // El panel abre igual: si el sync falla se ve el ultimo estado conocido y
 // recargar reintenta.
 }
}

function money(value: number) {
 return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function Section({
 title,
 hint,
 children,
 action,
}: {
 title: string;
 hint?: string;
 children: React.ReactNode;
 action?: React.ReactNode;
}) {
 return (
 <section className="mt-10">
 <div className="flex flex-wrap items-end justify-between gap-3">
 <div>
 <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2>
 {hint ? <p className="mt-0.5 text-sm font-light text-zinc-500">{hint}</p> : null}
 </div>
 {action}
 </div>
 <div className="mt-4">{children}</div>
 </section>
 );
}

function Empty({ children }: { children: React.ReactNode }) {
 return <p className="py-4 text-sm font-light text-zinc-400">{children}</p>;
}

export default async function AdminReferralsPage({
 searchParams,
}: {
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const sp = await searchParams;
 const partnerFilter = typeof sp.partnerId === "string" ? sp.partnerId : "all";

 await syncIfStale();
 const data = await fetchReferralsAdminOverview();
 const baseUrl = getPublicBaseUrl();

 const phoneByPartner = new Map(data.partnerOptions.map((p) => [p.id, p.phone]));
 const shopsByPartner = new Map<string, typeof data.referredShops>();
 for (const shop of data.referredShops) {
 const list = shopsByPartner.get(shop.partnerId) ?? [];
 list.push(shop);
 shopsByPartner.set(shop.partnerId, list);
 }

 async function updatePartnerAction(formData: FormData) {
 "use server";
 const partnerId = String(formData.get("partnerId") || "").trim();
 if (!partnerId) return;
 await upsertReferralPartner({
 partnerId,
 name: String(formData.get("name") || ""),
 email: String(formData.get("email") || "") || null,
 phone: String(formData.get("phone") || "") || null,
 referralCode: String(formData.get("referralCode") || ""),
 commissionPercentOverride: formData.get("commissionPercentOverride")
 ? Number(formData.get("commissionPercentOverride"))
 : null,
 commissionMonthsOverride: formData.get("commissionMonthsOverride")
 ? Number(formData.get("commissionMonthsOverride"))
 : null,
 isActive: Boolean(formData.get("isActive") === "on"),
 });
 revalidateAfterMutation();
 }

 async function assignShopAction(formData: FormData) {
 "use server";
 const shopId = String(formData.get("shopId") || "").trim();
 const partnerId = String(formData.get("partnerId") || "").trim();
 if (!shopId || !partnerId) return;
 await assignReferralToShop({ shopId, partnerId });
 revalidateAfterMutation();
 }

 async function unassignShopAction(formData: FormData) {
 "use server";
 const shopId = String(formData.get("shopId") || "").trim();
 if (!shopId) return;
 await deleteReferralAttribution(shopId);
 revalidateAfterMutation();
 }

 async function updateSettingsAction(formData: FormData) {
 "use server";
 const rawFallbackFee = String(formData.get("fallbackMpFeePercent") || "").trim();
 await updateReferralProgramSettings({
 defaultCommissionPercent: Number(formData.get("defaultCommissionPercent") || 0),
 defaultCommissionMonths: Number(formData.get("defaultCommissionMonths") || 0),
 fallbackMpFeePercent: rawFallbackFee ? Number(rawFallbackFee) : undefined,
 });
 revalidateAfterMutation();
 }

 function revalidateAfterMutation() {
 revalidatePath("/admin/referrals");
 redirect("/admin/referrals");
 }

 const needsReviewCount = data.totals.needsReviewCount;

 return (
 <div className="space-y-2">
 <header className="flex flex-wrap items-end justify-between gap-4">
 <div>
 <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
 Referidos y comisiones
 </h1>
 <p className="mt-1 text-sm font-light text-zinc-500">
 {data.settings.default_commission_percent}% de lo que entra, durante los primeros{" "}
 {data.settings.default_commission_months} pagos de cada local.
 </p>
 </div>
 <div className="flex items-center gap-2">
 <a
 href="/admin"
 className="rounded-full px-3 py-1.5 text-sm text-zinc-500 transition hover:bg-zinc-100"
 >
 Volver
 </a>
 <PartnerOnboarding
 existingCodes={data.partnerOptions.map((p) => ({ partnerId: p.id, referralCode: p.referralCode }))}
 baseUrl={baseUrl}
 defaultCommissionPercent={data.settings.default_commission_percent}
 defaultCommissionMonths={data.settings.default_commission_months}
 trigger={
 <button
 type="button"
 className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
 >
 <UserPlus className="h-4 w-4" />
 Nuevo vendedor
 </button>
 }
 />
 </div>
 </header>

 <div className="mt-6 grid grid-cols-2 gap-6 border-y border-zinc-200/70 py-5 sm:grid-cols-4">
 <Metric label="Vendedores" value={String(data.totals.partners)} />
 <Metric label="Locales referidos" value={String(data.totals.referredShops)} />
 <Metric label="Te debo" value={money(data.totals.pendingCommission)} tone="amber" />
 <Metric
 label="A revisar"
 value={String(needsReviewCount)}
 tone={needsReviewCount > 0 ? "rose" : undefined}
 />
 </div>

 <Section
 title="Te debo"
 hint="Una fila por local y por mes. Marcá lo que transferiste."
 >
 <TransferList
 transfers={data.pendingTransfers}
 activePartnerFilter={partnerFilter}
 partnerOptions={data.partnerOptions.map((p) => ({ id: p.id, name: p.name }))}
 />
 </Section>

 <Section
 title="Vendedores"
 hint="Tocá el lápiz para editar, o Link para ver el acceso y el QR."
 >
 {data.partners.length === 0 ? (
 <Empty>Todavía no hay vendedores. Creá uno con el botón de arriba.</Empty>
 ) : (
 <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {data.partners.map((partner) => (
 <li key={partner.partnerId}>
 <PartnerCard
 partner={partner}
 shops={shopsByPartner.get(partner.partnerId) ?? []}
 baseUrl={baseUrl}
 phone={phoneByPartner.get(partner.partnerId) ?? null}
 editAction={updatePartnerAction}
 />
 </li>
 ))}
 </ul>
 )}
 </Section>

 <Section
 title="Locales referidos"
 hint="Tocá un local para cambiar su vendedor o sacárselo."
 >
 {data.referredShops.length === 0 ? (
 <Empty>Todavía no llegó ningún local por link de referido.</Empty>
 ) : (
 <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
 {data.referredShops.map((shop) => (
 <li key={shop.shopId}>
 <ShopTile
 shop={shop}
 partnerOptions={data.partnerOptions.map((p) => ({
 id: p.id,
 name: p.name,
 referralCode: p.referralCode,
 isActive: p.isActive,
 }))}
 assignAction={assignShopAction}
 unassignAction={unassignShopAction}
 />
 </li>
 ))}
 </ul>
 )}
 </Section>

 {needsReviewCount > 0 ? (
 <Section
 title="A revisar"
 hint="No se pudo saber cuánto entró a Klip. Cargá el neto que verificaste en Mercado Pago y la comisión queda pagable."
 >
 <NeedsReviewList items={data.needsReview} />
 </Section>
 ) : null}

 {data.unattributedShops.length > 0 ? (
 <Section
 title={`Locales sin vendedor (${data.unattributedShops.length})`}
 hint="Llegaron por link pero quedaron sin atribuir. Asignalos a un vendedor."
 >
 <form action={assignShopAction} className="flex flex-wrap items-end gap-2">
 <label className="text-xs text-zinc-500">
 Local
 <select
 name="shopId"
 className="mt-1 block rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 >
 {data.unattributedShops.map((shop) => (
 <option key={shop.id} value={shop.id}>
 {shop.name} ({shop.industryName})
 </option>
 ))}
 </select>
 </label>
 <label className="text-xs text-zinc-500">
 Vendedor
 <select
 name="partnerId"
 className="mt-1 block rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 >
 {data.partnerOptions.map((partner) => (
 <option key={partner.id} value={partner.id}>
 {partner.name} [{partner.referralCode}]
 </option>
 ))}
 </select>
 </label>
 <button type="submit" className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 text-sm font-medium">
 Asignar
 </button>
 </form>
 </Section>
 ) : null}

 <Section
 title="Regla del programa"
 hint="Aplica solo a los vendedores nuevos. Cambiar la regla no reinicia los pagos ya contados."
 >
 <form
 action={updateSettingsAction}
 className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200/80 p-4"
 >
 <label className="text-xs text-zinc-500">
 Comisión %
 <input
 name="defaultCommissionPercent"
 type="number"
 min="0"
 max="100"
 step="0.1"
 defaultValue={data.settings.default_commission_percent}
 className="mt-1 block w-32 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 </label>
 <label className="text-xs text-zinc-500">
 Meses
 <input
 name="defaultCommissionMonths"
 type="number"
 min="1"
 max="24"
 defaultValue={data.settings.default_commission_months}
 className="mt-1 block w-32 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 </label>
 <label className="text-xs text-zinc-500">
 Fee MP estimada %
 <input
 name="fallbackMpFeePercent"
 type="number"
 min="0"
 max="30"
 step="0.1"
 defaultValue={data.settings.fallback_mp_fee_percent}
 className="mt-1 block w-32 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm"
 />
 </label>
 <button type="submit" className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 text-sm font-medium">
 Guardar regla
 </button>
 {data.totals.fallbackAmounts > 0 ? (
 <p className="w-full text-xs text-zinc-400">
 Hoy hay {data.totals.fallbackAmounts} pagos con fee estimada. Sirve solo para pagos viejos sin dato
 real de Mercado Pago.
 </p>
 ) : null}
 </form>
 </Section>

 {data.payouts.length > 0 ? (
 <Section title="Historial de pagos">
 <ul className="divide-y divide-zinc-100">
 {data.payouts.slice(0, 20).map((payout) => (
 <li key={payout.id} className="flex items-center justify-between py-3 text-sm">
 <span className="text-zinc-500">
 {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString("es-AR") : "Sin fecha"} ·{" "}
 {payout.partnerName}
 </span>
 <span className="font-medium tabular-nums text-zinc-900">
 {money(payout.amount)}
 </span>
 </li>
 ))}
 </ul>
 </Section>
 ) : null}

 <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-zinc-300">
 <LinkIcon className="h-3 w-3" />
 Sincronizado al abrir esta página · hoy es{" "}
 {new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
 </p>
 </div>
 );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "amber" | "rose" }) {
 const color =
 tone === "amber"
 ? "text-amber-600"
 : tone === "rose"
 ? "text-rose-600"
 : "text-zinc-900";

 return (
 <div>
 <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</p>
 <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${color}`}>{value}</p>
 </div>
 );
}
