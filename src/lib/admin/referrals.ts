"use server";

import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { generatePin, hashPin, pinLast4 } from "@/lib/referrals/partner-auth";
import type { Database, Json } from "@/lib/supabase/database.types";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { toArgentinaLocalIsoString } from "@/lib/argentina-time";

type ServiceClient = Awaited<ReturnType<typeof createServiceRoleClient>>;
type LedgerInsert = Database["public"]["Tables"]["referral_commission_ledger"]["Insert"];
type ProgramSettingsInsert = Database["public"]["Tables"]["referral_program_settings"]["Update"];

type ProgramSettings = {
  default_commission_percent: number;
  default_commission_months: number;
  fallback_mp_fee_percent: number;
};

type PartnerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referral_code: string;
  commission_percent_override: number | null;
  commission_months_override: number | null;
  is_active: boolean;
  pin_hash: string | null;
  pin_last4: string | null;
  payout_alias: string | null;
  payout_cbu: string | null;
};

type AttributionRow = {
  id: string;
  shop_id: string;
  partner_id: string;
  attributed_at: string;
  commission_percent_snapshot: number;
  commission_months_snapshot: number;
};

type ShopRow = {
  id: string;
  nombre: string;
  slug: string;
  industry: string | null;
};

type BillingEventPayload = {
  payment_id?: string | null;
  external_reference?: string | null;
  gross_amount?: number | null;
  mp_fee?: number | null;
  net_amount?: number | null;
  amount?: number | null;
};

type BillingEventRow = {
  id: string;
  shop_id: string;
  created_at: string;
  payload: BillingEventPayload | null;
};

type LedgerRow = {
  id: string;
  partner_id: string;
  shop_id: string;
  billing_event_id: string;
  payment_applied_at: string;
  payment_sequence: number;
  commission_amount: number;
  commission_percent: number;
  base_amount: number;
  mp_fee: number;
  net_amount: number;
  amount_source: string | null;
  status: "pending" | "needs_review" | "paid" | "cancelled";
  payout_id: string | null;
  period_ym: string;
};

type PayoutRow = {
  id: string;
  partner_id: string;
  paid_at: string | null;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  created_at: string;
};

export type AmountSource = "payment_event" | "checkout_join" | "unknown";

/**
 * `needs_review` no es un estado "pendiente de pago": es un pago del que NO se
 * conoce el neto y por lo tanto la comision es 0 hasta que un humano lo cargue.
 * Existe para que un pago sin dato real sea visible en el panel en vez de
 * liquidarse con un numero inventado.
 */
export type LedgerStatus = "pending" | "needs_review";

export type LedgerDraft = {
  partner_id: string;
  shop_id: string;
  billing_event_id: string;
  payment_id: string | null;
  payment_applied_at: string;
  payment_sequence: number;
  period_ym: string;
  base_amount: number;
  mp_fee: number;
  net_amount: number;
  commission_percent: number;
  commission_amount: number;
  amount_source: AmountSource;
  status: LedgerStatus;
};

export type PartnerSummary = {
  partnerId: string;
  partnerName: string;
  partnerEmail: string | null;
  referralCode: string;
  isActive: boolean;
  hasPin: boolean;
  pinLast4: string | null;
  payoutAlias: string | null;
  payoutCbu: string | null;
  rulePercent: number;
  ruleMonths: number;
  referredShops: number;
  totalCommissionGenerated: number;
  pendingCommission: number;
  paidCommission: number;
};

export type ReferredShopItem = {
  shopId: string;
  partnerId: string;
  shopName: string;
  shopSlug: string;
  industryName: string;
  partnerName: string;
  commissionPercent: number;
  commissionMonths: number;
  attributedAt: string;
  paymentsTracked: number;
  pendingCommission: number;
};

export type PendingTransferItem = {
  ledgerId: string;
  partnerId: string;
  partnerName: string;
  shopId: string;
  shopName: string;
  periodYm: string;
  paymentSequence: number;
  grossAmount: number;
  mpFee: number;
  netAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  amountSource: AmountSource | null;
  status: LedgerStatus;
  payoutAlias: string | null;
  payoutCbu: string | null;
  paidAt: string;
};

export type ReferralsAdminOverview = {
  generatedAt: string;
  totals: {
    partners: number;
    referredShops: number;
    trackedPayments: number;
    pendingCommission: number;
    paidCommission: number;
    pendingTransfers: number;
    needsReviewCount: number;
    totalMpFees: number;
    fallbackAmounts: number;
  };
  settings: ProgramSettings;
  partners: PartnerSummary[];
  referredShops: ReferredShopItem[];
  pendingTransfers: PendingTransferItem[];
  /** Pagos cuyo neto no se pudo determinar. No entran al flujo de pago. */
  needsReview: PendingTransferItem[];
  partnerOptions: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    referralCode: string;
    isActive: boolean;
    hasPin: boolean;
    payoutAlias: string | null;
    payoutCbu: string | null;
    commissionPercentOverride: number | null;
    commissionMonthsOverride: number | null;
  }>;
  unattributedShops: Array<{
    id: string;
    name: string;
    slug: string;
    industryName: string;
  }>;
  payouts: Array<{
    id: string;
    partnerName: string;
    amount: number;
    status: "pending" | "paid" | "cancelled";
    paidAt: string | null;
    createdAt: string;
  }>;
};

/**
 * Periodo contable en hora Argentina, no UTC. Con getUTC* un pago aprobado a las
 * 21:00 ART del dia 31 caia en el mes siguiente, y `period_ym` es justamente la
 * columna por la que el admin agrupa las transferencias del mes.
 */
function toYm(date: Date): string {
  return toArgentinaLocalIsoString(date).slice(0, 7);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

async function appendAdminAudit(action: string, payload: Record<string, unknown>) {
  const session = await requireSuperAdmin();
  const admin = await createServiceRoleClient();
  await admin.from("admin_audit_logs").insert({
    actor_user_id: session.userId,
    action,
    target_type: "referrals",
    target_id: null,
    payload: payload as Json,
  });
}

async function getDefaultProgramSettings(admin: ServiceClient): Promise<ProgramSettings> {
  const { data } = await admin
    .from("referral_program_settings")
    .select("default_commission_percent, default_commission_months, fallback_mp_fee_percent")
    .eq("is_default", true)
    .maybeSingle();

  const row = data as
    | { default_commission_percent?: number | null; default_commission_months?: number | null; fallback_mp_fee_percent?: number | null }
    | null;
  return {
    default_commission_percent: Number(row?.default_commission_percent ?? 100),
    default_commission_months: Number(row?.default_commission_months ?? 2),
    fallback_mp_fee_percent: Number(row?.fallback_mp_fee_percent ?? 4),
  };
}

/**
 * Resuelve cuanto entro realmente a la cuenta de Klip por un pago.
 *
 * El referidor cobra sobre el NETO, no sobre el bruto: si Mercado Pago se
 * comio 1.400 de un pago de 40.000, la base imponible son 38.600. Asi Klip no
 * queda nunca en perdida por la fee.
 *
 * Prioridad de fuentes:
 *   payment_event  -> gross/mp_fee/net vienen del webhook (fuente real)
 *   checkout_join  -> el monto sale del evento de checkout, la fee se estima
 *
 * Si no hay ninguna de las dos devuelve `ok: false`. ANTES habia un tercer
 * camino, `fallback_price`, que multiplicaba el precio ACTUAL del plan por el
 * fee de fallback. Se elimino a proposito: el precio de Klip ya cambio mas de
 * una vez (25.000 -> 9.500 -> 15.000), asi que para un pago de 9.500 esa
 * formula pagaba al vendedor sobre 15.000. Ademas el evento de checkout nunca
 * matchea con un cobro automatico, asi que todos los meses siguientes caian a
 *hi. Pagar sobre un precio vigente que no es el que se cobro es peor que pedir
 * revision manual: es plata que sale de Klip.
 */
function resolvePaymentAmount(
  payload: BillingEventPayload | null,
  checkoutAmount: number | undefined,
  fallbackFeePercent: number,
): { ok: true; gross: number; mpFee: number; net: number; source: AmountSource } | { ok: false } {
  const feeRate = Math.max(0, Number(fallbackFeePercent) || 0) / 100;

  // Distinguir "el evento no trae montos" de "el neto real es 0". Un pago con
  // fee del 100% (octogonal) llega con net_amount = 0 y es un dato VALIDO: la
  // comision es 0. Si se usara truthiness, caeria al fallback y se pagaria de
  // mas. El webhook escribe los tres campos juntos o ninguno, asi que la
  // presencia de los tres es lo que marca el dato como confiable.
  const hasEventAmounts =
    payload?.gross_amount !== undefined && payload?.gross_amount !== null &&
    payload?.mp_fee !== undefined && payload?.mp_fee !== null &&
    payload?.net_amount !== undefined && payload?.net_amount !== null;

  const eventGross = Number(payload?.gross_amount);
  const eventFee = Number(payload?.mp_fee);
  const eventNet = Number(payload?.net_amount);

  if (
    hasEventAmounts &&
    Number.isFinite(eventGross) &&
    Number.isFinite(eventFee) &&
    Number.isFinite(eventNet) &&
    eventGross > 0 &&
    eventFee >= 0 &&
    eventNet >= 0
  ) {
    return {
      ok: true,
      gross: round2(eventGross),
      mpFee: round2(eventFee),
      net: round2(eventNet),
      source: "payment_event",
    };
  }

  const joinedGross = Number(checkoutAmount ?? 0);
  if (joinedGross > 0) {
    const fee = round2(joinedGross * feeRate);
    return {
      ok: true,
      gross: round2(joinedGross),
      mpFee: fee,
      net: round2(joinedGross - fee),
      source: "checkout_join",
    };
  }

  return { ok: false };
}

/**
 * Tope de eventos que se leen por corrida. Es una red de seguridad, no un
 * limite de negocio: si se llega, es porque algo se rompio y hay que enterarse,
 * nunca calcular una comision parcial en silencio (PostgREST trunca en 1000 por
 * defecto y con .order() ascendente se comeria justo los eventos NUEVOS).
 */
const MAX_EVENTS_PER_SYNC = 5000;

/**
 * Calcula las comisiones pendientes. No escribe nada: arma los drafts y los
 * devuelve. `syncReferralLedger` es la unica que los persiste, y solo cuando
 * dryRun es false.
 */
async function buildLedgerDrafts(admin: ServiceClient): Promise<LedgerDraft[]> {
  // Los eventos se piden en una segunda tanda, filtrados por los locales
  // referidos. Leerlos en la primera tanda arrastraba la tabla completa de
  // shop_billing_events (todos los locales, todos los meses) para descartar
  // despues casi todo: el costo crecia con la base y no con los referidos.
  const [settings, partnersResult, attributionsResult, ledgerResult] = await Promise.all([
    getDefaultProgramSettings(admin),
    admin
      .from("referral_partners")
      .select(
        "id, name, email, phone, referral_code, commission_percent_override, commission_months_override, is_active, pin_hash, pin_last4, payout_alias, payout_cbu",
      ),
    admin
      .from("referral_attributions")
      .select("id, shop_id, partner_id, attributed_at, commission_percent_snapshot, commission_months_snapshot"),
    admin.from("referral_commission_ledger").select("id, billing_event_id"),
  ]);

  const partners = (partnersResult.data || []) as PartnerRow[];
  const attributions = (attributionsResult.data || []) as AttributionRow[];
  const existingLedger = (ledgerResult.data || []) as Array<{ id: string; billing_event_id: string }>;

  // Sin referidos no hay nada que calcular y no se toca la tabla de eventos.
  const referredShopIds = [...new Set(attributions.map((a) => a.shop_id))];

  let events: (BillingEventRow & { event_type: string })[] = [];

  if (referredShopIds.length > 0) {
    const eventsResult = await admin
      .from("shop_billing_events")
      .select("id, shop_id, created_at, payload, event_type")
      .in("shop_id", referredShopIds)
      .in("event_type", [
        "subscription_payment_applied",
        "subscription_auto_charge_applied",
        "subscription_checkout_created",
      ])
      .order("created_at", { ascending: true })
      .limit(MAX_EVENTS_PER_SYNC + 1);

    events = (eventsResult.data || []) as (BillingEventRow & { event_type: string })[];

    if (events.length > MAX_EVENTS_PER_SYNC) {
      // Fallar fuerte es la unica opcion segura: truncar en silencio pagaria de
      // menos a los vendedores y nadie se enteraria hasta el pago.
      throw new Error(
        `El sync de comisiones supero el tope de ${MAX_EVENTS_PER_SYNC} eventos para ` +
          `${referredShopIds.length} locales referidos. No se calculo nada para no ` +
          `generar comisiones incompletas. Revisar el rango de fechas en buildLedgerDrafts.`,
      );
    }
  }

  const existingBillingEventIds = new Set(existingLedger.map((l) => l.billing_event_id));
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const attributionByShop = new Map(attributions.map((a) => [a.shop_id, a]));

  const appliedByShop = new Map<string, BillingEventRow[]>();
  const checkoutAmountByRef = new Map<string, number>();

  for (const event of events) {
    if (event.event_type === "subscription_checkout_created") {
      const ref = event.payload?.external_reference;
      const amount = Number(event.payload?.amount ?? 0);
      if (ref && amount > 0 && !checkoutAmountByRef.has(ref)) checkoutAmountByRef.set(ref, amount);
      continue;
    }
    const list = appliedByShop.get(event.shop_id) || [];
    list.push(event);
    appliedByShop.set(event.shop_id, list);
  }

  const drafts: LedgerDraft[] = [];

  for (const [shopId, shopEvents] of appliedByShop) {
    const attribution = attributionByShop.get(shopId);
    if (!attribution) continue;

    const partner = partnerById.get(attribution.partner_id);
    if (!partner) continue;

    // Tasa viva: editar el % o los meses de un vendedor se refleja al toque.
    // El snapshot queda en referral_attributions solo para auditoria.
    // ?? y no || porque 0% y 0 meses son valores validos y no deben caer al default.
    const commissionPercent = Number(
      partner.commission_percent_override ?? settings.default_commission_percent,
    );
    const commissionMonths = Math.floor(
      partner.commission_months_override ?? settings.default_commission_months,
    );

    if (!Number.isFinite(commissionPercent) || commissionPercent < 0) continue;
    if (!Number.isFinite(commissionMonths) || commissionMonths <= 0) continue;

    // Solo cuentan los pagos POSTERIORES a la atribucion. Antes de este fix se
    // contaba el indice sobre todos los pagos historicos del local, asi que un
    // local con 3 pagos previos nunca pasaba el corte y quedaba en 0.
    //
    // La comparacion es por timestamp, no por string: Postgres devuelve
    // timestamptz con precision variable ("...+00:00" vs "...123456+00:00") y
    // comparar texto las ordena mal.
    const attributedAtMs = attribution.attributed_at
      ? new Date(attribution.attributed_at).getTime()
      : null;
    const ordered = shopEvents
      .filter((e) => {
        if (attributedAtMs === null || Number.isNaN(attributedAtMs)) return true;
        return new Date(e.created_at).getTime() >= attributedAtMs;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    ordered.forEach((event, index) => {
      if (existingBillingEventIds.has(event.id)) return;

      const paymentSequence = index + 1;
      if (paymentSequence > commissionMonths) return;

      const ref = event.payload?.external_reference;
      const checkoutAmount = ref ? checkoutAmountByRef.get(ref) : undefined;
      const amounts = resolvePaymentAmount(
        event.payload,
        checkoutAmount,
        settings.fallback_mp_fee_percent,
      );

      // Sin monto confiable la fila se crea igual, con comision 0 y estado
      // needs_review. Crearla mantiene la secuencia (este pago conto como uno de
      // los N) y la deja a la vista; omitirla correria el corte y haria que el
      // siguiente pago entre como numero 1 cuando en realidad es el 2.
      if (!amounts.ok) {
        drafts.push({
          partner_id: attribution.partner_id,
          shop_id: attribution.shop_id,
          billing_event_id: event.id,
          payment_id: event.payload?.payment_id || null,
          payment_applied_at: event.created_at,
          payment_sequence: paymentSequence,
          period_ym: toYm(new Date(event.created_at)),
          base_amount: 0,
          mp_fee: 0,
          net_amount: 0,
          commission_percent: round2(commissionPercent),
          commission_amount: 0,
          amount_source: "unknown",
          status: "needs_review",
        });
        return;
      }

      drafts.push({
        partner_id: attribution.partner_id,
        shop_id: attribution.shop_id,
        billing_event_id: event.id,
        payment_id: event.payload?.payment_id || null,
        payment_applied_at: event.created_at,
        payment_sequence: paymentSequence,
        period_ym: toYm(new Date(event.created_at)),
        base_amount: amounts.gross,
        mp_fee: amounts.mpFee,
        net_amount: amounts.net,
        commission_percent: round2(commissionPercent),
        commission_amount: round2((amounts.net * commissionPercent) / 100),
        amount_source: amounts.source,
        status: "pending",
      });
    });
  }

  drafts.sort((a, b) => a.payment_applied_at.localeCompare(b.payment_applied_at));
  return drafts;
}

async function syncReferralLedger(
  admin: ServiceClient,
  options?: { dryRun?: boolean },
): Promise<{ inserted: number; drafts: LedgerDraft[] }> {
  const drafts = await buildLedgerDrafts(admin);

  if (options?.dryRun) return { inserted: 0, drafts };
  if (drafts.length === 0) return { inserted: 0, drafts };

  const { error } = await admin
    .from("referral_commission_ledger")
    .upsert(drafts as unknown as LedgerInsert[], {
      onConflict: "billing_event_id",
      ignoreDuplicates: true,
    });

  if (error) throw new Error(`No se pudo guardar el ledger de comisiones: ${error.message}`);

  return { inserted: drafts.length, drafts };
}

export async function syncReferralLedgerInternal(options?: { dryRun?: boolean }) {
  const admin = await createServiceRoleClient();
  return syncReferralLedger(admin, options);
}

export async function fetchReferralsAdminOverview(): Promise<ReferralsAdminOverview> {
  await requireSuperAdmin();
  const admin = await createServiceRoleClient();

  const [settings, partnersResult, attributionsResult, shopsResult, ledgerResult, payoutsResult] = await Promise.all([
    getDefaultProgramSettings(admin),
    admin
      .from("referral_partners")
      .select(
        "id, name, email, phone, referral_code, commission_percent_override, commission_months_override, is_active, pin_hash, pin_last4, payout_alias, payout_cbu",
      )
      .order("created_at", { ascending: true }),
    admin
      .from("referral_attributions")
      .select("id, shop_id, partner_id, attributed_at, commission_percent_snapshot, commission_months_snapshot"),
    admin.from("shops").select("id, nombre, slug, industry"),
    admin
      .from("referral_commission_ledger")
      .select(
        "id, partner_id, shop_id, billing_event_id, payment_applied_at, payment_sequence, period_ym, commission_amount, commission_percent, base_amount, mp_fee, net_amount, amount_source, status, payout_id",
      )
      .order("payment_applied_at", { ascending: false }),
    admin
      .from("referral_commission_payouts")
      .select("id, partner_id, paid_at, amount, status, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const partners = (partnersResult.data || []) as PartnerRow[];
  const attributions = (attributionsResult.data || []) as AttributionRow[];
  const shops = (shopsResult.data || []) as ShopRow[];
  const ledger = (ledgerResult.data || []) as LedgerRow[];
  const payouts = (payoutsResult.data || []) as PayoutRow[];

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const shopById = new Map(shops.map((s) => [s.id, s]));

  const referredShops: ReferredShopItem[] = attributions.map((attr) => {
    const shop = shopById.get(attr.shop_id);
    const partner = partnerById.get(attr.partner_id);
    const shopLedger = ledger.filter((l) => l.shop_id === attr.shop_id);
    const pending = shopLedger
      .filter((l) => l.status === "pending")
      .reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
    return {
      shopId: attr.shop_id,
      // El id va explicito porque la UI lo necesita para reasignar sin
      // depender del nombre: dos vendedores con el mismo nombre o uno
      // renombrado hacian que el select cayera en el partner equivocado.
      partnerId: attr.partner_id,
      shopName: shop?.nombre || "Local",
      shopSlug: shop?.slug || "-",
      industryName: shop ? INDUSTRY_CONFIG[resolveIndustry(shop.industry)].displayName : "-",
      partnerName: partner?.name || "-",
      commissionPercent: Number(attr.commission_percent_snapshot),
      commissionMonths: Number(attr.commission_months_snapshot),
      attributedAt: attr.attributed_at,
      paymentsTracked: shopLedger.length,
      pendingCommission: round2(pending),
    };
  });

  const partnersSummary: PartnerSummary[] = partners.map((partner) => {
    const partnerAttributions = attributions.filter((a) => a.partner_id === partner.id);
    const partnerLedger = ledger.filter((l) => l.partner_id === partner.id);
    const rulePercent = Number(partner.commission_percent_override ?? settings.default_commission_percent);
    const ruleMonths = Number(partner.commission_months_override ?? settings.default_commission_months);
    const totalCommissionGenerated = partnerLedger.reduce(
      (acc, item) => acc + Number(item.commission_amount || 0),
      0,
    );
    const pendingCommission = partnerLedger
      .filter((l) => l.status === "pending")
      .reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
    const paidCommission = partnerLedger
      .filter((l) => l.status === "paid")
      .reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);

    return {
      partnerId: partner.id,
      partnerName: partner.name,
      partnerEmail: partner.email,
      referralCode: partner.referral_code,
      isActive: partner.is_active,
      hasPin: Boolean(partner.pin_hash),
      pinLast4: partner.pin_last4,
      payoutAlias: partner.payout_alias,
      payoutCbu: partner.payout_cbu,
      rulePercent,
      ruleMonths,
      referredShops: partnerAttributions.length,
      totalCommissionGenerated: round2(totalCommissionGenerated),
      pendingCommission: round2(pendingCommission),
      paidCommission: round2(paidCommission),
    };
  });

  const toTransferItem = (l: LedgerRow): PendingTransferItem => {
    const partner = partnerById.get(l.partner_id);
    return {
      ledgerId: l.id,
      partnerId: l.partner_id,
      partnerName: partner?.name || "Partner",
      shopId: l.shop_id,
      shopName: shopById.get(l.shop_id)?.nombre || "Local",
      periodYm: l.period_ym,
      paymentSequence: Number(l.payment_sequence),
      grossAmount: round2(Number(l.base_amount || 0)),
      mpFee: round2(Number(l.mp_fee || 0)),
      netAmount: round2(Number(l.net_amount || 0)),
      commissionPercent: Number(l.commission_percent),
      commissionAmount: round2(Number(l.commission_amount || 0)),
      amountSource: (l.amount_source as AmountSource | null) ?? null,
      status: (l.status as LedgerStatus) ?? "pending",
      payoutAlias: partner?.payout_alias || null,
      payoutCbu: partner?.payout_cbu || null,
      paidAt: l.payment_applied_at,
    };
  };

  // needs_review queda FUERA de pendingTransfers a proposito: su comision es 0
  // porque el neto no se pudo determinar, y meterla en la lista de pagos
  // permitiria marcarla como pagada y cerrar el mes con un importe inventado.
  const pendingTransfers: PendingTransferItem[] = ledger
    .filter((l) => l.status === "pending")
    .map(toTransferItem);

  const needsReview: PendingTransferItem[] = ledger
    .filter((l) => l.status === "needs_review")
    .map(toTransferItem);

  const pendingCommission = ledger
    .filter((l) => l.status === "pending")
    .reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
  const paidCommission = ledger
    .filter((l) => l.status === "paid")
    .reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
  const totalMpFees = pendingTransfers.reduce((acc, item) => acc + item.mpFee, 0);
  const fallbackAmounts = pendingTransfers.filter(
    (item) => item.amountSource !== null && item.amountSource !== "payment_event",
  ).length;

  const attributedShopIds = new Set(attributions.map((a) => a.shop_id));
  const unattributedShops = shops
    .filter((shop) => !attributedShopIds.has(shop.id))
    .map((shop) => ({
      id: shop.id,
      name: shop.nombre || "Local",
      slug: shop.slug || "-",
      industryName: INDUSTRY_CONFIG[resolveIndustry(shop.industry)].displayName,
    }));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      partners: partners.length,
      referredShops: attributions.length,
      trackedPayments: ledger.length,
      pendingCommission: round2(pendingCommission),
      paidCommission: round2(paidCommission),
      pendingTransfers: pendingTransfers.length,
      needsReviewCount: needsReview.length,
      totalMpFees: round2(totalMpFees),
      fallbackAmounts,
    },
    settings,
    partners: partnersSummary,
    referredShops,
    pendingTransfers,
    needsReview,
    partnerOptions: partners.map((partner) => ({
      id: partner.id,
      name: partner.name,
      email: partner.email,
      phone: partner.phone,
      referralCode: partner.referral_code,
      isActive: partner.is_active,
      hasPin: Boolean(partner.pin_hash),
      payoutAlias: partner.payout_alias,
      payoutCbu: partner.payout_cbu,
      commissionPercentOverride: partner.commission_percent_override,
      commissionMonthsOverride: partner.commission_months_override,
    })),
    unattributedShops,
    payouts: payouts.map((payout) => ({
      id: payout.id,
      partnerName: partnerById.get(payout.partner_id)?.name || "Partner",
      amount: round2(Number(payout.amount || 0)),
      status: payout.status,
      paidAt: payout.paid_at,
      createdAt: payout.created_at,
    })),
  };
}

export async function syncReferralLedgerNow(options?: {
  dryRun?: boolean;
}): Promise<{ success: boolean; inserted?: number; error?: string; preview?: LedgerDraft[] }> {
  try {
    await requireSuperAdmin();
    const result = await syncReferralLedgerInternal(options);
    if (options?.dryRun) {
      return { success: true, inserted: 0, preview: result.drafts };
    }
    await appendAdminAudit("referrals.sync_ledger", { inserted: result.inserted });
    return { success: true, inserted: result.inserted };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo sincronizar ledger",
    };
  }
}

/**
 * Corre una fila que quedo en `needs_review` con el neto real.
 *
 * El sync crea la fila con comision 0 cuando no puede determinar cuanto entro a
 * Klip (tipicamente un auto-cargo de MP que no se pudo resolver contra la API).
 * Antes no habia ninguna forma de cerrarla desde la app: la fila quedaba
 * terminal y para siempre consumiendo un slot de la ventana de comision del
 * local. Ahora el admin carga el neto que verifico en el panel de MP y la fila
 * pasa a pagable.
 *
 * El recalculo usa el mismo criterio que el sync —comision sobre el neto— para
 * que una fila resuelta a mano sea indistinguible de una calculada sola.
 */
export async function resolveNeedsReviewLedgerRow(input: {
  ledgerId: string;
  netAmount: number;
}): Promise<{ success: boolean; error?: string; commissionAmount?: number }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const ledgerId = input.ledgerId.trim();
    if (!ledgerId) return { success: false, error: "Falta la comision" };

    const net = Number(input.netAmount);
    if (!Number.isFinite(net) || net <= 0) {
      return { success: false, error: "El neto tiene que ser mayor a 0" };
    }

    const { data: row } = await admin
      .from("referral_commission_ledger")
      .select("id, status, commission_percent, amount_source")
      .eq("id", ledgerId)
      .maybeSingle();

    if (!row) return { success: false, error: "La comision no existe" };
    if (row.status !== "needs_review") {
      return { success: false, error: "Esa comision ya no esta para revisar" };
    }

    const commissionAmount = round2((net * Number(row.commission_percent || 0)) / 100);
    const { error } = await admin
      .from("referral_commission_ledger")
      .update({
        net_amount: round2(net),
        commission_amount: commissionAmount,
        amount_source: "manual_review",
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ledgerId);

    if (error) return { success: false, error: error.message };

    await appendAdminAudit("referrals.resolve_needs_review", { ledgerId, netAmount: round2(net), commissionAmount });
    return { success: true, commissionAmount };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo resolver la comision",
    };
  }
}

export async function updateReferralProgramSettings(input: {
  defaultCommissionPercent: number;
  defaultCommissionMonths: number;
  fallbackMpFeePercent?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();

    const percent = Number(input.defaultCommissionPercent);
    const months = Number(input.defaultCommissionMonths);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { success: false, error: "Porcentaje invalido" };
    }
    if (!Number.isFinite(months) || months < 0 || months > 24) {
      return { success: false, error: "Meses invalidos" };
    }

    const payload: ProgramSettingsInsert = {
      default_commission_percent: Number(percent.toFixed(3)),
      default_commission_months: Math.floor(months),
      updated_at: new Date().toISOString(),
    };

    if (input.fallbackMpFeePercent !== undefined) {
      const fee = Number(input.fallbackMpFeePercent);
      if (!Number.isFinite(fee) || fee < 0 || fee > 30) {
        return { success: false, error: "Comision MP estimada invalida" };
      }
      payload.fallback_mp_fee_percent = Number(fee.toFixed(3));
    }

    // Si la fila default no existiera, un update a secas matcheaba 0 filas y el
    // admin creia que guardo la regla. Se resuelve por id explicitamente en vez
    // de usar upsert con onConflict porque uq_referral_program_settings_default
    // es un indice PARCIAL (where is_default = true) y PostgREST no puede
    // expresar esa prediccion en el ON CONFLICT.
    const { data: current } = await admin
      .from("referral_program_settings")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();

    const write = current?.id
      ? admin.from("referral_program_settings").update(payload).eq("id", current.id)
      : admin
          .from("referral_program_settings")
          .insert({ ...payload, is_default: true } satisfies ProgramSettingsInsert);

    const { error: settingsError } = await write;

    if (settingsError) {
      return { success: false, error: settingsError.message };
    }

    await appendAdminAudit("referrals.update_program_settings", {
      defaultCommissionPercent: percent,
      defaultCommissionMonths: months,
      fallbackMpFeePercent: input.fallbackMpFeePercent,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo guardar configuracion",
    };
  }
}

export async function upsertReferralPartner(input: {
  partnerId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  referralCode: string;
  commissionPercentOverride?: number | null;
  commissionMonthsOverride?: number | null;
  payoutAlias?: string | null;
  payoutCbu?: string | null;
  isActive: boolean;
}): Promise<{ success: boolean; error?: string; partnerId?: string; generatedPin?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();

    const name = input.name.trim();
    const referralCode = input.referralCode.trim().toLowerCase();
    if (!name) return { success: false, error: "Nombre requerido" };
    if (!referralCode) return { success: false, error: "Codigo requerido" };
    if (!/^[a-z0-9._-]{3,40}$/.test(referralCode)) {
      return { success: false, error: "El codigo solo puede tener letras, numeros, punto, guion o guion bajo (3 a 40)" };
    }

    const commissionPercentOverride =
      input.commissionPercentOverride === null || input.commissionPercentOverride === undefined
        ? null
        : Number(input.commissionPercentOverride);
    const commissionMonthsOverride =
      input.commissionMonthsOverride === null || input.commissionMonthsOverride === undefined
        ? null
        : Math.floor(Number(input.commissionMonthsOverride));

    if (
      commissionPercentOverride !== null &&
      (!Number.isFinite(commissionPercentOverride) || commissionPercentOverride < 0 || commissionPercentOverride > 100)
    ) {
      return { success: false, error: "Porcentaje de comision invalido" };
    }
    if (
      commissionMonthsOverride !== null &&
      (!Number.isFinite(commissionMonthsOverride) || commissionMonthsOverride < 0 || commissionMonthsOverride > 24)
    ) {
      return { success: false, error: "Meses de comision invalidos" };
    }

    const payload = {
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      referral_code: referralCode,
      commission_percent_override: commissionPercentOverride,
      commission_months_override: commissionMonthsOverride,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    };

    // Los datos de cobro se tocan SOLO si vienen explicitamente. Un update que no
    // los manda (el form de editar nombre o telefono) tiene que dejarlos como
    // estaban: antes se escribian siempre con `|| null` y por eso guardar el
    // nombre de un vendedor borraba el alias y el CBU que Klip ya tenia cargados.
    const payoutPatch =
      input.payoutAlias !== undefined || input.payoutCbu !== undefined
        ? {
            payout_alias: input.payoutAlias?.trim() || null,
            payout_cbu: input.payoutCbu?.trim() || null,
          }
        : null;

    if (input.partnerId) {
      const { error } = await admin
        .from("referral_partners")
        .update(payoutPatch ? { ...payload, ...payoutPatch } : payload)
        .eq("id", input.partnerId);
      if (error) return { success: false, error: error.message };
      await appendAdminAudit("referrals.update_partner", { partnerId: input.partnerId, referralCode });
      return { success: true, partnerId: input.partnerId };
    }

    const pin = generatePin();
    const pinHash = await hashPin(pin);
    const { data: created, error } = await admin
      .from("referral_partners")
      .insert({
        ...payload,
        ...(payoutPatch ?? { payout_alias: null, payout_cbu: null }),
        pin_hash: pinHash,
        pin_last4: pinLast4(pin),
        pin_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Ese codigo de referido ya esta en uso" };
      }
      return { success: false, error: error.message };
    }

    await appendAdminAudit("referrals.create_partner", { referralCode, partnerId: created?.id });
    return { success: true, partnerId: created?.id, generatedPin: pin };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo guardar partner",
    };
  }
}

/**
 * Regenera el PIN de un vendedor.
 *
 * El PIN es solo la llave de entrada: la identidad del vendedor es
 * referral_partners.id y referral_code no se tocan, asi que sus locales,
 * atribuciones y comisiones quedan intactos. El PIN anterior deja de servir
 * al instante.
 */
export async function regeneratePartnerPin(
  partnerId: string,
): Promise<{ success: boolean; pin?: string; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const id = partnerId.trim();
    if (!id) return { success: false, error: "Vendedor invalido" };

    const { data: existing } = await admin
      .from("referral_partners")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return { success: false, error: "Vendedor no encontrado" };

    const pin = generatePin();
    const { error } = await admin
      .from("referral_partners")
      .update({
        pin_hash: await hashPin(pin),
        pin_last4: pinLast4(pin),
        pin_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await appendAdminAudit("referrals.regenerate_partner_pin", { partnerId: id });
    return { success: true, pin };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo regenerar el PIN",
    };
  }
}

export async function updateReferralPartnerOverrides(input: {
  partnerId: string;
  commissionPercentOverride?: number | null;
  commissionMonthsOverride?: number | null;
  payoutAlias?: string | null;
  payoutCbu?: string | null;
  isActive: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const partnerId = input.partnerId.trim();
    if (!partnerId) return { success: false, error: "Vendedor invalido" };

    const commissionPercentOverride =
      input.commissionPercentOverride === null || input.commissionPercentOverride === undefined
        ? null
        : Number(input.commissionPercentOverride);
    const commissionMonthsOverride =
      input.commissionMonthsOverride === null || input.commissionMonthsOverride === undefined
        ? null
        : Math.floor(Number(input.commissionMonthsOverride));

    if (
      commissionPercentOverride !== null &&
      (!Number.isFinite(commissionPercentOverride) || commissionPercentOverride < 0 || commissionPercentOverride > 100)
    ) {
      return { success: false, error: "Porcentaje de comision invalido" };
    }
    if (
      commissionMonthsOverride !== null &&
      (!Number.isFinite(commissionMonthsOverride) || commissionMonthsOverride < 0 || commissionMonthsOverride > 24)
    ) {
      return { success: false, error: "Meses de comision invalidos" };
    }

    const { error } = await admin
      .from("referral_partners")
      .update({
        commission_percent_override: commissionPercentOverride,
        commission_months_override: commissionMonthsOverride,
        // Igual que en upsertReferralPartner: si el caller no manda los datos de
        // cobro, no se tocan. El form de overrides solo se ocupa de la regla.
        ...(input.payoutAlias !== undefined || input.payoutCbu !== undefined
          ? {
              payout_alias: input.payoutAlias?.trim() || null,
              payout_cbu: input.payoutCbu?.trim() || null,
            }
          : {}),
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerId);

    if (error) return { success: false, error: error.message };

    await appendAdminAudit("referrals.update_partner_overrides", {
      partnerId,
      commissionPercentOverride,
      commissionMonthsOverride,
      isActive: input.isActive,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar vendedor",
    };
  }
}

/**
 * Solo los datos de cobro. Es lo unico que edita Klip del payout: el vendedor
 * los ve en su panel pero no los puede cambiar.
 */
export async function updateReferralPartnerPayout(input: {
  partnerId: string;
  payoutAlias: string | null;
  payoutCbu: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const id = input.partnerId.trim();
    if (!id) return { success: false, error: "Vendedor invalido" };

    const cbu = input.payoutCbu?.replace(/\s+/g, "") || null;
    if (cbu && !/^\d{22}$/.test(cbu)) {
      return { success: false, error: "El CBU tiene que tener 22 digitos" };
    }

    const { error } = await admin
      .from("referral_partners")
      .update({
        payout_alias: input.payoutAlias?.trim() || null,
        payout_cbu: cbu,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await appendAdminAudit("referrals.update_partner_payout", { partnerId: id });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo guardar los datos de cobro",
    };
  }
}

export async function deleteReferralAttribution(shopId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const normalizedShopId = shopId.trim();
    if (!normalizedShopId) return { success: false, error: "Local invalido" };

    const { error: deleteError } = await admin
      .from("referral_attributions")
      .delete()
      .eq("shop_id", normalizedShopId);
    if (deleteError) return { success: false, error: deleteError.message };

    // Las comisiones todavia no transferidas de este local dejan de ser pagables.
    // Antes quedaban en 'pending' y el admin podia pagarle a un vendedor por un
    // local que ya no era suyo. Las 'paid' se conservan: son historia contable.
    const { data: cancelled, error: cancelError } = await admin
      .from("referral_commission_ledger")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("shop_id", normalizedShopId)
      .in("status", ["pending", "needs_review"])
      .select("id");

    if (cancelError) return { success: false, error: cancelError.message };

    await appendAdminAudit("referrals.unassign_shop", {
      shopId: normalizedShopId,
      cancelledLedgerRows: cancelled?.length ?? 0,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo desasignar",
    };
  }
}

export async function assignReferralToShop(input: {
  shopId: string;
  partnerId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const shopId = input.shopId.trim();
    const partnerId = input.partnerId.trim();
    if (!shopId || !partnerId) return { success: false, error: "Datos incompletos" };

    const [settings, partnerResult] = await Promise.all([
      getDefaultProgramSettings(admin),
      admin
        .from("referral_partners")
        .select("id, referral_code, commission_percent_override, commission_months_override")
        .eq("id", partnerId)
        .maybeSingle(),
    ]);

    const partner = partnerResult.data as {
      id: string;
      referral_code: string;
      commission_percent_override: number | null;
      commission_months_override: number | null;
    } | null;
    if (!partner?.id) return { success: false, error: "Vendedor no encontrado" };

    const percentSnapshot = Number(
      partner.commission_percent_override ?? settings.default_commission_percent,
    );
    const monthsSnapshot = Math.floor(
      partner.commission_months_override ?? settings.default_commission_months,
    );

    const { data: existing } = await admin
      .from("referral_attributions")
      .select("id, partner_id")
      .eq("shop_id", shopId)
      .maybeSingle();

    // Reasignarle el MISMO vendedor no es una reasignacion: es el select del
    // form reenviado. `attributed_at` es el reloj de la comision — buildLedgerDrafts
    // cuenta solo los pagos posteriores a el y reinicia payment_sequence desde 1.
    // Si lo moviamos aca, guardar el formulario sin cambiar nada regalaba N meses
    // extra de comision encima de las filas que ya estaban en el ledger.
    if (existing?.id && existing.partner_id === partnerId) {
      await appendAdminAudit("referrals.assign_shop_noop", { shopId, partnerId });
      return { success: true };
    }

    const payload = {
      shop_id: shopId,
      partner_id: partnerId,
      attributed_at: new Date().toISOString(),
      referral_code_snapshot: partner.referral_code,
      commission_percent_snapshot: percentSnapshot,
      commission_months_snapshot: monthsSnapshot,
    };

    const { error } = existing?.id
      ? await admin.from("referral_attributions").update(payload).eq("id", existing.id)
      : await admin.from("referral_attributions").insert(payload);

    if (error) return { success: false, error: error.message };

    await appendAdminAudit("referrals.assign_shop", {
      shopId,
      partnerId,
      commissionPercentSnapshot: percentSnapshot,
      commissionMonthsSnapshot: monthsSnapshot,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo asignar referido",
    };
  }
}

export async function markPartnerCommissionsAsPaid(partnerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await admin.rpc("admin_mark_partner_commissions_paid", {
      p_partner_id: partnerId,
      p_actor_user_id: session.userId,
    });

    if (rpcError) return { success: false, error: rpcError.message };

    const row = Array.isArray(rpcRows)
      ? (rpcRows[0] as { updated_count?: number; total_amount?: number } | undefined)
      : undefined;
    const items = Number(row?.updated_count || 0);
    const amount = Number(row?.total_amount || 0);
    if (items === 0) return { success: true };

    await appendAdminAudit("referrals.mark_partner_paid", {
      partnerId,
      items,
      amount: round2(amount),
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo marcar como pagado",
    };
  }
}

/**
 * Marca como pagadas filas concretas del ledger. El modelo acordado es una
 * transferencia por local y por mes, asi que se pagan fila por fila y no
 * agrupando todo lo pendiente del vendedor.
 */
export async function markReferralLedgerRowsPaid(
  ledgerIds: string[],
): Promise<{ success: boolean; items?: number; amount?: number; error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const ids = (ledgerIds || []).map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) return { success: false, error: "No hay comisiones seleccionadas" };

    const admin = await createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await admin.rpc("admin_mark_referral_ledger_paid", {
      p_ledger_ids: ids,
      p_actor_user_id: session.userId,
    });

    if (rpcError) return { success: false, error: rpcError.message };

    const row = Array.isArray(rpcRows)
      ? (rpcRows[0] as { updated_count?: number; total_amount?: number } | undefined)
      : undefined;
    const items = Number(row?.updated_count || 0);
    const amount = round2(Number(row?.total_amount || 0));

    if (items === 0) return { success: false, error: "Esas comisiones ya estaban pagadas" };

    await appendAdminAudit("referrals.mark_ledger_paid", { items, amount });
    return { success: true, items, amount };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo marcar como pagado",
    };
  }
}

// ---------------------------------------------------------------------------
// Rutas publicas (sin super admin) — las usa /r/[code] y el alta de locales
// ---------------------------------------------------------------------------

export async function findActivePartnerByCode(
  code: string,
): Promise<{ id: string; name: string; referral_code: string } | null> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from("referral_partners")
    .select("id, name, referral_code")
    .eq("referral_code", normalized)
    .eq("is_active", true)
    .maybeSingle();

  return (data as { id: string; name: string; referral_code: string } | null) ?? null;
}

export type ReferralLinkOutcome = "attributed" | "already_taken" | "not_a_shop";

/**
 * Deja registro de una visita a un link /r/<codigo>. Sirve para que el
 * vendedor perdedor vea que local se le escapó, y como auditoría de clicks.
 */
export async function recordReferralLinkClick(input: {
  partnerId: string;
  shopId: string;
  code: string;
  outcome: ReferralLinkOutcome;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await createServiceRoleClient();
    const { error } = await admin.from("referral_link_clicks").insert({
      partner_id: input.partnerId,
      shop_id: input.shopId,
      code: input.code.trim().toLowerCase(),
      outcome: input.outcome,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo registrar el click",
    };
  }
}

/**
 * Asigna un local a un vendedor. No pisa una atribucion existente: gana el
 * primero, y devuelve 'already_taken' para que el link registre el choque.
 */
export async function attributeShopToPartner(input: {
  shopId: string;
  partnerId: string;
}): Promise<{
  outcome: ReferralLinkOutcome;
  code?: string;
  ownerPartnerId?: string;
}> {
  const shopId = input.shopId.trim();
  const partnerId = input.partnerId.trim();
  if (!shopId || !partnerId) return { outcome: "not_a_shop" };

  const admin = await createServiceRoleClient();

  const { data: partner } = await admin
    .from("referral_partners")
    .select("id, referral_code, is_active, commission_percent_override, commission_months_override")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) return { outcome: "not_a_shop" };

  const code = partner.referral_code;

  const { data: existing } = await admin
    .from("referral_attributions")
    .select("id, partner_id")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (existing?.id) {
    return {
      outcome: existing.partner_id === partnerId ? "attributed" : "already_taken",
      code,
      ownerPartnerId: existing.partner_id,
    };
  }

  if (!partner.is_active) return { outcome: "already_taken", code };

  const settings = await getDefaultProgramSettings(admin);
  const percentSnapshot = Number(
    partner.commission_percent_override ?? settings.default_commission_percent,
  );
  const monthsSnapshot = Math.floor(
    partner.commission_months_override ?? settings.default_commission_months,
  );

  const { error } = await admin.from("referral_attributions").insert({
    shop_id: shopId,
    partner_id: partnerId,
    attributed_at: new Date().toISOString(),
    referral_code_snapshot: partner.referral_code,
    commission_percent_snapshot: percentSnapshot,
    commission_months_snapshot: monthsSnapshot,
  });

  // 23505 = unique de shop_id. Ganó una carrera: el primero se queda con el local.
    if (error) {
      if (error.code === "23505") {
        const { data: winner } = await admin
          .from("referral_attributions")
          .select("partner_id")
          .eq("shop_id", shopId)
          .maybeSingle();
        return { outcome: "already_taken", code, ownerPartnerId: winner?.partner_id };
      }
      return { outcome: "not_a_shop", code };
    }

  return { outcome: "attributed", code };
}
