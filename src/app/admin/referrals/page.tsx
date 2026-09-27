import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import PartnerForm from "@/components/admin/referrals/partner-form";
import { PinButton, PayoutFields } from "@/components/admin/referrals/partner-access";
import {
  deleteReferralAttribution,
  assignReferralToShop,
  fetchReferralsAdminOverview,
  markPartnerCommissionsAsPaid,
  markReferralLedgerRowsPaid,
  syncReferralLedgerNow,
  updateReferralPartnerOverrides,
  updateReferralProgramSettings,
  upsertReferralPartner,
} from "@/lib/admin/referrals";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(value);
}

function toCsvCell(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function asPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value || "");
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const previewText = typeof sp.preview === "string" ? sp.preview : "";
  const previewCount = typeof sp.count === "string" ? sp.count : "0";
  const data = await fetchReferralsAdminOverview();
  const status = typeof sp.status === "string" ? sp.status : "";
  const statusMessage =
    status === "settings_saved"
      ? { type: "success", text: "Regla global actualizada." }
      : status === "partner_saved"
        ? { type: "success", text: "Partner guardado." }
        : status === "shop_assigned"
          ? { type: "success", text: "Local asignado correctamente." }
          : status === "shop_unassigned"
            ? { type: "success", text: "Local desasignado del partner." }
            : status === "paid_marked"
              ? { type: "success", text: "Comisiones marcadas como pagadas." }
              : status === "sync_done"
                ? { type: "success", text: "Ledger de comisiones sincronizado." }
                : status === "dry_run"
                  ? {
                      type: "success",
                      text: `Simulacion: ${previewCount} comision(es) se generarian. No se escribio nada.${previewText ? ` ${previewText}` : ""}`,
                    }
              : status.startsWith("error_")
                ? { type: "error", text: "No se pudo completar la accion. Revisa los datos e intenta de nuevo." }
                : null;
  const partnerFilter = typeof sp.partnerId === "string" ? sp.partnerId : "all";
  const industryFilter = typeof sp.industry === "string" ? sp.industry : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const partnerPage = asPositiveInt(typeof sp.partnerPage === "string" ? sp.partnerPage : undefined, 1);
  const shopsPage = asPositiveInt(typeof sp.shopsPage === "string" ? sp.shopsPage : undefined, 1);
  const perPage = 8;

  const partnerCodes = data.partnerOptions.map((item) => ({
    partnerId: item.id,
    referralCode: item.referralCode,
  }));

  const partnersFiltered = data.partners.filter((partner) => {
    if (!q) return true;
    return (
      partner.partnerName.toLowerCase().includes(q) ||
      partner.referralCode.toLowerCase().includes(q) ||
      (partner.partnerEmail || "").toLowerCase().includes(q)
    );
  });
  const partnersTotalPages = Math.max(1, Math.ceil(partnersFiltered.length / perPage));
  const safePartnerPage = Math.min(partnerPage, partnersTotalPages);
  const partnersPaged = partnersFiltered.slice((safePartnerPage - 1) * perPage, safePartnerPage * perPage);

  const referredShopsFiltered = data.referredShops.filter((shop) => {
    const byPartner = partnerFilter === "all" || data.partnerOptions.find((p) => p.id === partnerFilter)?.name === shop.partnerName;
    const byIndustry = industryFilter === "all" || shop.industryName.toLowerCase() === industryFilter.toLowerCase();
    const byQuery =
      !q ||
      shop.shopName.toLowerCase().includes(q) ||
      shop.shopSlug.toLowerCase().includes(q) ||
      shop.partnerName.toLowerCase().includes(q);
    return byPartner && byIndustry && byQuery;
  });
  const shopsTotalPages = Math.max(1, Math.ceil(referredShopsFiltered.length / perPage));
  const safeShopsPage = Math.min(shopsPage, shopsTotalPages);
  const shopsPaged = referredShopsFiltered.slice((safeShopsPage - 1) * perPage, safeShopsPage * perPage);

  const csvRows = [
    ["local", "slug", "rubro", "partner", "comision_percent", "meses", "pagos_comisionados", "pendiente_ars"],
    ...referredShopsFiltered.map((row) => [
      row.shopName,
      row.shopSlug,
      row.industryName,
      row.partnerName,
      row.commissionPercent,
      row.commissionMonths,
      row.paymentsTracked,
      row.pendingCommission,
    ]),
  ];
  const csvContent = csvRows.map((row) => row.map(toCsvCell).join(",")).join("\n");
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;

  // CSV aparte para conciliar los pagos sin neto contra el panel de Mercado Pago.
  // Va separado del de locales porque tiene otro corte: uno es por local, este
  // es por pago.
  const reviewCsvRows = [
    ["partner", "local", "mes", "pago_n", "estado", "fuente", "comision_ars", "aplicado_en"],
    ...data.needsReview.map((item) => [
      item.partnerName,
      item.shopName,
      item.periodYm,
      item.paymentSequence,
      item.status,
      item.amountSource || "sin_dato",
      item.commissionAmount,
      item.paidAt,
    ]),
  ];
  const reviewCsvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    reviewCsvRows.map((row) => row.map(toCsvCell).join(",")).join("\n"),
  )}`;

  async function markPaidAction(formData: FormData) {
    "use server";
    const partnerId = String(formData.get("partnerId") || "").trim();
    if (!partnerId) return;
    const result = await markPartnerCommissionsAsPaid(partnerId);
    revalidatePath("/admin/referrals");
    revalidatePath("/admin");
    redirect(`/admin/referrals?status=${result.success ? "paid_marked" : "error_paid"}`);
  }

  async function markTransferPaidAction(formData: FormData) {
    "use server";
    const ledgerId = String(formData.get("ledgerId") || "").trim();
    if (!ledgerId) return;
    const result = await markReferralLedgerRowsPaid([ledgerId]);
    revalidatePath("/admin/referrals");
    revalidatePath("/admin");
    redirect(`/admin/referrals?status=${result.success ? "paid_marked" : "error_paid"}`);
  }

  async function simulateLedgerAction() {
    "use server";
    const result = await syncReferralLedgerNow({ dryRun: true });
    const preview = (result.preview || [])
      .slice(0, 20)
      .map(
        (row) =>
          `${row.shop_id} #${row.payment_sequence} ${row.period_ym} bruto=${row.base_amount} fee=${row.mp_fee} neto=${row.net_amount} ${row.commission_percent}% => ${row.commission_amount} (${row.amount_source})`,
      )
      .join(" ~ ");
    revalidatePath("/admin/referrals");
    redirect(
      `/admin/referrals?status=dry_run&preview=${encodeURIComponent(preview)}&count=${(result.preview || []).length}`,
    );
  }

  async function updateSettingsAction(formData: FormData) {
    "use server";
    const percent = Number(formData.get("defaultCommissionPercent") || 0);
    const months = Number(formData.get("defaultCommissionMonths") || 0);
    const rawFallbackFee = String(formData.get("fallbackMpFeePercent") || "").trim();
    const result = await updateReferralProgramSettings({
      defaultCommissionPercent: percent,
      defaultCommissionMonths: months,
      fallbackMpFeePercent: rawFallbackFee ? Number(rawFallbackFee) : undefined,
    });
    revalidatePath("/admin/referrals");
    redirect(`/admin/referrals?status=${result.success ? "settings_saved" : "error_settings"}`);
  }

  async function createPartnerAction(formData: FormData) {
    "use server";
    const partnerId = String(formData.get("partnerId") || "").trim();
    const isActive = partnerId ? Boolean(formData.get("isActive") === "on") : true;
    const result = await upsertReferralPartner({
      partnerId: partnerId || undefined,
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || "") || null,
      phone: String(formData.get("phone") || "") || null,
      referralCode: String(formData.get("referralCode") || ""),
      commissionPercentOverride: formData.get("commissionPercentOverride") ? Number(formData.get("commissionPercentOverride")) : null,
      commissionMonthsOverride: formData.get("commissionMonthsOverride") ? Number(formData.get("commissionMonthsOverride")) : null,
      isActive,
    });
    revalidatePath("/admin/referrals");
    redirect(`/admin/referrals?status=${result.success ? "partner_saved" : "error_partner"}`);
  }

  async function updatePartnerRuleAction(formData: FormData) {
    "use server";
    const partnerId = String(formData.get("partnerId") || "");
    const result = await updateReferralPartnerOverrides({
      partnerId,
      commissionPercentOverride: formData.get("commissionPercentOverride") ? Number(formData.get("commissionPercentOverride")) : null,
      commissionMonthsOverride: formData.get("commissionMonthsOverride") ? Number(formData.get("commissionMonthsOverride")) : null,
      isActive: Boolean(formData.get("isActive") === "on"),
    });
    revalidatePath("/admin/referrals");
    redirect(`/admin/referrals?status=${result.success ? "partner_saved" : "error_partner"}`);
  }

  async function assignShopAction(formData: FormData) {
    "use server";
    const shopId = String(formData.get("shopId") || "");
    const partnerId = String(formData.get("partnerId") || "");
    const result = await assignReferralToShop({ shopId, partnerId });
    revalidatePath("/admin/referrals");
    redirect(`/admin/referrals?status=${result.success ? "shop_assigned" : "error_assign"}`);
  }

  async function unassignShopAction(formData: FormData) {
    "use server";
    const shopId = String(formData.get("shopId") || "");
    const result = await deleteReferralAttribution(shopId);
    revalidatePath("/admin/referrals");
    redirect(`/admin/referrals?status=${result.success ? "shop_unassigned" : "error_unassign"}`);
  }

  async function syncLedgerAction() {
    "use server";
    const cronSecret = process.env.CRON_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar";

    let result: { success: boolean; inserted?: number; error?: string } = { success: false, error: "sync_failed" };

    if (cronSecret) {
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/cron/referral-ledger-sync`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${cronSecret}`,
          },
          cache: "no-store",
        });
        const data = (await response.json()) as { ok?: boolean; inserted?: number; error?: string };
        result = {
          success: Boolean(response.ok && data.ok),
          inserted: Number(data.inserted || 0),
          error: data.error,
        };
      } catch {
        result = { success: false, error: "sync_failed" };
      }
    } else {
      result = await syncReferralLedgerNow();
    }

    revalidatePath("/admin/referrals");
    redirect(`/admin/referrals?status=${result.success ? "sync_done" : "error_sync"}`);
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Referidos y comisiones</h2>
          <p className="mt-1 text-sm text-zinc-500">Regla global actual: {data.settings.default_commission_percent}% por {data.settings.default_commission_months} meses (solo referidos nuevos).</p>
        </div>
        <Link href="/admin" className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-white">
          Volver a admin
        </Link>
      </section>

      <section className="flex flex-wrap justify-end gap-2">
        <form action={simulateLedgerAction}>
          <button type="submit" className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Simular (sin escribir)
          </button>
        </form>
        <form action={syncLedgerAction}>
          <button type="submit" className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Sincronizar ledger comisiones
          </button>
        </form>
      </section>

      {statusMessage ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            statusMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {statusMessage.text}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <form className="flex flex-col gap-3 md:flex-row md:items-end">
          <div>
            <label className="text-xs text-zinc-500">Buscar</label>
            <input name="q" defaultValue={q} placeholder="partner, local, slug, codigo" className="mt-1 min-w-[260px] rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Filtrar por partner</label>
            <select name="partnerId" defaultValue={partnerFilter} className="mt-1 min-w-[260px] rounded-xl border border-zinc-300 px-3 py-2 text-sm">
              <option value="all">Todos</option>
              {data.partnerOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">Filtrar por rubro</label>
            <select name="industry" defaultValue={industryFilter} className="mt-1 min-w-[220px] rounded-xl border border-zinc-300 px-3 py-2 text-sm">
              <option value="all">Todos</option>
              {Array.from(new Set(data.referredShops.map((item) => item.industryName))).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Aplicar filtros</button>
          <a href={csvHref} download="referrals-pending.csv" className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700">Exportar CSV</a>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Partners</p><p className="mt-1 text-2xl font-semibold">{data.totals.partners}</p></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Locales referidos</p><p className="mt-1 text-2xl font-semibold">{data.totals.referredShops}</p></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Pagos trazados</p><p className="mt-1 text-2xl font-semibold">{data.totals.trackedPayments}</p></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Comision pendiente</p><p className="mt-1 text-2xl font-semibold text-amber-700">{money(data.totals.pendingCommission)}</p></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Comision pagada</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{money(data.totals.paidCommission)}</p></div>
        <div className={`rounded-2xl border bg-white p-4 ${data.totals.needsReviewCount > 0 ? "border-red-300 ring-1 ring-red-200" : "border-zinc-200"}`}>
          <p className="text-xs text-zinc-500">A revisar</p>
          <p className={`mt-1 text-2xl font-semibold ${data.totals.needsReviewCount > 0 ? "text-red-700" : ""}`}>{data.totals.needsReviewCount}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <form action={updateSettingsAction} className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
          <h3 className="text-base font-semibold">Regla global</h3>
          <div>
            <label className="text-xs text-zinc-500">Comision (%)</label>
            <input name="defaultCommissionPercent" defaultValue={data.settings.default_commission_percent} type="number" min="0" max="100" step="0.1" className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Meses comisionables</label>
            <input name="defaultCommissionMonths" defaultValue={data.settings.default_commission_months} type="number" min="0" max="24" className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Fee MP estimada si no hay dato (%)</label>
            <input name="fallbackMpFeePercent" defaultValue={data.settings.fallback_mp_fee_percent} type="number" min="0" max="30" step="0.1" className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-[11px] text-zinc-500">Solo se usa cuando el monto del pago se conoce pero la fee no (pagos viejos registrados por el checkout). Hoy hay {data.totals.fallbackAmounts} con fee estimada.</p>
          </div>
          <button type="submit" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Guardar regla</button>
        </form>

        <PartnerForm action={createPartnerAction} existingCodes={partnerCodes} submitLabel="Crear partner" />

        <form action={assignShopAction} className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
          <h3 className="text-base font-semibold">Asignar local a partner</h3>
          <select name="shopId" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" required>
            <option value="">Seleccionar local sin atribucion</option>
            {data.unattributedShops.map((shop) => (
              <option key={shop.id} value={shop.id}>{shop.name} ({shop.industryName})</option>
            ))}
          </select>
          <select name="partnerId" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" required>
            <option value="">Seleccionar partner</option>
            {data.partnerOptions.map((partner) => (
              <option key={partner.id} value={partner.id}>{partner.name} [{partner.referralCode}]</option>
            ))}
          </select>
          <button type="submit" className="ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">Asignar referido</button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Overrides y pagos por partner</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1160px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Partner</th><th className="px-2 py-2">Codigo</th><th className="px-2 py-2">Locales</th><th className="px-2 py-2">Pendiente</th><th className="px-2 py-2">Pagada</th><th className="px-2 py-2">Acceso</th><th className="px-2 py-2">Cobro</th><th className="px-2 py-2">Editar partner</th><th className="px-2 py-2">Override</th><th className="px-2 py-2">Acciones</th>
              </tr>
            </thead>            <tbody>
              {partnersPaged.map((partner) => {
                const partnerOption = data.partnerOptions.find((p) => p.id === partner.partnerId);
                return (
                  <tr key={partner.partnerId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2"><p className="font-medium">{partner.partnerName}</p><p className="text-xs text-zinc-500">{partner.partnerEmail || "sin email"}</p></td>
                    <td className="px-2 py-2">{partner.referralCode}</td>
                    <td className="px-2 py-2">{partner.referredShops}</td>
                    <td className="px-2 py-2 text-amber-700 font-medium">{money(partner.pendingCommission)}</td>
                    <td className="px-2 py-2 text-emerald-700">{money(partner.paidCommission)}</td>
                    <td className="px-2 py-2">
                      <PinButton
                        partnerId={partner.partnerId}
                        partnerName={partner.partnerName}
                        hasPin={Boolean(partner.hasPin)}
                      />
                      {partner.hasPin ? (
                        <p className="mt-1 text-[11px] text-zinc-500">
                          PIN activo (termina en {partner.pinLast4 || "????"})
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <PayoutFields
                        partnerId={partner.partnerId}
                        partnerName={partner.partnerName}
                        defaultAlias={partner.payoutAlias ?? null}
                        defaultCbu={partner.payoutCbu ?? null}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <PartnerForm
                        action={createPartnerAction}
                        existingCodes={partnerCodes}
                        partnerId={partner.partnerId}
                        defaultName={partner.partnerName}
                        defaultEmail={partner.partnerEmail || ""}
                        defaultPhone={partnerOption?.phone || ""}
                        defaultReferralCode={partner.referralCode}
                        defaultCommissionPercentOverride={partnerOption?.commissionPercentOverride ?? null}
                        defaultCommissionMonthsOverride={partnerOption?.commissionMonthsOverride ?? null}
                        defaultIsActive={partner.isActive}
                        compact
                        submitLabel="Guardar"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <form action={updatePartnerRuleAction} className="flex items-center gap-2">
                        <input type="hidden" name="partnerId" value={partner.partnerId} />
                        <input name="commissionPercentOverride" defaultValue={partnerOption?.commissionPercentOverride ?? ""} type="number" min="0" max="100" step="0.1" placeholder="%" className="w-20 rounded-lg border border-zinc-300 px-2 py-1" />
                        <input name="commissionMonthsOverride" defaultValue={partnerOption?.commissionMonthsOverride ?? ""} type="number" min="1" max="24" placeholder="meses" className="w-20 rounded-lg border border-zinc-300 px-2 py-1" />
                        <label className="inline-flex items-center gap-1 text-xs text-zinc-600"><input type="checkbox" name="isActive" defaultChecked={partner.isActive} /> activo</label>
                        <button type="submit" className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white">Guardar</button>
                      </form>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <form action={markPaidAction}>
                          <input type="hidden" name="partnerId" value={partner.partnerId} />
                          <button type="submit" disabled={partner.pendingCommission <= 0} className="ui-btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold">Marcar pagado</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>Pagina {safePartnerPage} de {partnersTotalPages}</span>
          <div className="flex items-center gap-2">
            {safePartnerPage > 1 ? <Link className="rounded-full border border-zinc-300 px-3 py-1" href={`?q=${encodeURIComponent(q)}&partnerId=${partnerFilter}&industry=${industryFilter}&partnerPage=${safePartnerPage - 1}&shopsPage=${safeShopsPage}`}>Anterior</Link> : null}
            {safePartnerPage < partnersTotalPages ? <Link className="rounded-full border border-zinc-300 px-3 py-1" href={`?q=${encodeURIComponent(q)}&partnerId=${partnerFilter}&industry=${industryFilter}&partnerPage=${safePartnerPage + 1}&shopsPage=${safeShopsPage}`}>Siguiente</Link> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Detalle por local referido</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Local</th>
                <th className="px-2 py-2">Rubro</th>
                <th className="px-2 py-2">Partner</th>
                <th className="px-2 py-2">Regla aplicable</th>
                <th className="px-2 py-2">Pagos comisionados</th>
                <th className="px-2 py-2">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {shopsPaged.map((shop) => {
                const currentPartner = data.partnerOptions.find((p) => p.name === shop.partnerName);
                return (
                <tr key={shop.shopId} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2 py-2"><p className="font-medium">{shop.shopName}</p><p className="text-xs text-zinc-500">/{shop.shopSlug}</p></td>
                  <td className="px-2 py-2">{shop.industryName}</td>
                  <td className="px-2 py-2">
                    <form action={assignShopAction} className="flex items-center gap-2">
                      <input type="hidden" name="shopId" value={shop.shopId} />
                      <select name="partnerId" defaultValue={currentPartner?.id || ""} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs">
                        {data.partnerOptions.map((partner) => (
                          <option key={partner.id} value={partner.id}>{partner.name}</option>
                        ))}
                      </select>
                      <button type="submit" className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-white">Reasignar</button>
                    </form>
                  </td>
                  <td className="px-2 py-2">{shop.commissionPercent}% x {shop.commissionMonths}m</td>
                  <td className="px-2 py-2">{shop.paymentsTracked}</td>
                  <td className="px-2 py-2 font-medium text-amber-700">
                    <div className="flex items-center gap-2">
                      <span>{money(shop.pendingCommission)}</span>
                      <form action={unassignShopAction}>
                        <input type="hidden" name="shopId" value={shop.shopId} />
                        <button type="submit" className="rounded-full border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700">Desasignar</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>Pagina {safeShopsPage} de {shopsTotalPages}</span>
          <div className="flex items-center gap-2">
            {safeShopsPage > 1 ? <Link className="rounded-full border border-zinc-300 px-3 py-1" href={`?q=${encodeURIComponent(q)}&partnerId=${partnerFilter}&industry=${industryFilter}&partnerPage=${safePartnerPage}&shopsPage=${safeShopsPage - 1}`}>Anterior</Link> : null}
            {safeShopsPage < shopsTotalPages ? <Link className="rounded-full border border-zinc-300 px-3 py-1" href={`?q=${encodeURIComponent(q)}&partnerId=${partnerFilter}&industry=${industryFilter}&partnerPage=${safePartnerPage}&shopsPage=${safeShopsPage + 1}`}>Siguiente</Link> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Transferencias pendientes</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Una fila por local y por mes. Transferí y marcá cada una: la comision se calcula sobre el neto que
          entro (bruto menos la fee de Mercado Pago).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Partner</th><th className="px-2 py-2">Local</th><th className="px-2 py-2">Mes</th><th className="px-2 py-2">Pago N</th><th className="px-2 py-2">Bruto</th><th className="px-2 py-2">Fee MP</th><th className="px-2 py-2">Neto</th><th className="px-2 py-2">Comision</th><th className="px-2 py-2">Fuente</th><th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.pendingTransfers.length === 0 ? (
                <tr><td colSpan={10} className="px-2 py-6 text-center text-zinc-500">No hay comisiones pendientes.</td></tr>
              ) : (
                data.pendingTransfers.map((transfer) => (
                  <tr key={transfer.ledgerId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2">{transfer.partnerName}</td>
                    <td className="px-2 py-2">{transfer.shopName}</td>
                    <td className="px-2 py-2">{transfer.periodYm}</td>
                    <td className="px-2 py-2">{transfer.paymentSequence}</td>
                    <td className="px-2 py-2">{money(transfer.grossAmount)}</td>
                    <td className="px-2 py-2 text-zinc-500">-{money(transfer.mpFee)}</td>
                    <td className="px-2 py-2">{money(transfer.netAmount)}</td>
                    <td className="px-2 py-2 font-semibold text-amber-700">{money(transfer.commissionAmount)}</td>
                    <td className="px-2 py-2 text-xs text-zinc-500">{transfer.amountSource || "sin dato"}</td>
                    <td className="px-2 py-2">
                      <form action={markTransferPaidAction}>
                        <input type="hidden" name="ledgerId" value={transfer.ledgerId} />
                        <button type="submit" className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white">
                          Marque pagado
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className={`rounded-2xl border bg-white p-4 ${data.needsReview.length > 0 ? "border-red-300" : "border-zinc-200"}`}
      >
        <h3 className="text-base font-semibold">
          Pagos sin neto conocido
          {data.needsReview.length > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {data.needsReview.length}
            </span>
          )}
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          El pago ocurrio pero no se pudo determinar cuanto entro a la cuenta (por ejemplo, un cobro automatico
          cuyo pago no se pudo resolver en Mercado Pago). La comision queda en 0 a proposito: no se inventa un neto.
          El pago sigue contando en la secuencia, asi que no se le descuenta al mes siguiente. Revisar el pago en
          Mercado Pago, cargar el neto y recien ahi se puede pagar.
        </p>
        {data.needsReview.length > 0 && (
          <a
            href={reviewCsvHref}
            download="referrals-para-revisar.csv"
            className="mt-3 inline-block rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
          >
            Exportar para revisar
          </a>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Partner</th><th className="px-2 py-2">Local</th><th className="px-2 py-2">Mes</th><th className="px-2 py-2">Pago N</th><th className="px-2 py-2">Comision</th><th className="px-2 py-2">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {data.needsReview.length === 0 ? (
                <tr><td colSpan={6} className="px-2 py-6 text-center text-zinc-500">No hay pagos para revisar.</td></tr>
              ) : (
                data.needsReview.map((item) => (
                  <tr key={item.ledgerId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2">{item.partnerName}</td>
                    <td className="px-2 py-2">{item.shopName}</td>
                    <td className="px-2 py-2">{item.periodYm}</td>
                    <td className="px-2 py-2">{item.paymentSequence}</td>
                    <td className="px-2 py-2 font-semibold text-red-700">{money(item.commissionAmount)}</td>
                    <td className="px-2 py-2 text-xs text-zinc-500">{item.amountSource || "sin dato"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold">Historial de payouts</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Partner</th>
                <th className="px-2 py-2">Monto</th>
                <th className="px-2 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.length === 0 ? (
                <tr><td colSpan={4} className="px-2 py-6 text-center text-zinc-500">Sin payouts registrados.</td></tr>
              ) : (
                data.payouts.slice(0, 20).map((payout) => (
                  <tr key={payout.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2">{new Date(payout.paidAt || payout.createdAt).toLocaleString("es-AR")}</td>
                    <td className="px-2 py-2">{payout.partnerName}</td>
                    <td className="px-2 py-2">{money(payout.amount)}</td>
                    <td className="px-2 py-2">{payout.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
