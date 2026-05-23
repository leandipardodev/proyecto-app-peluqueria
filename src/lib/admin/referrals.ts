"use server";

import { BILLING_PRICES } from "@/lib/billing/plans";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";

type ProgramSettings = {
  default_commission_percent: number;
  default_commission_months: number;
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
};

type AttributionRow = {
  id: string;
  shop_id: string;
  partner_id: string;
  commission_percent_snapshot: number;
  commission_months_snapshot: number;
};

type ShopRow = {
  id: string;
  nombre: string;
  slug: string;
  industry: string | null;
};

type BillingEventRow = {
  id: string;
  shop_id: string;
  created_at: string;
  payload: { payment_id?: string | null } | null;
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
  status: "pending" | "paid" | "cancelled";
  payout_id: string | null;
};

type PayoutRow = {
  id: string;
  partner_id: string;
  paid_at: string | null;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  created_at: string;
};

export type PartnerSummary = {
  partnerId: string;
  partnerName: string;
  partnerEmail: string | null;
  referralCode: string;
  isActive: boolean;
  rulePercent: number;
  ruleMonths: number;
  referredShops: number;
  totalRevenueTracked: number;
  totalCommissionGenerated: number;
  pendingCommission: number;
  paidCommission: number;
};

export type ReferredShopItem = {
  shopId: string;
  shopName: string;
  shopSlug: string;
  industryName: string;
  partnerName: string;
  commissionPercent: number;
  commissionMonths: number;
  paymentsTracked: number;
  pendingCommission: number;
};

export type ReferralsAdminOverview = {
  generatedAt: string;
  totals: {
    partners: number;
    referredShops: number;
    trackedPayments: number;
    pendingCommission: number;
    paidCommission: number;
  };
  settings: ProgramSettings;
  partners: PartnerSummary[];
  referredShops: ReferredShopItem[];
  partnerOptions: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    referralCode: string;
    isActive: boolean;
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

function toYm(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function appendAdminAudit(action: string, payload: Record<string, unknown>) {
  const session = await requireSuperAdmin();
  const admin = await createServiceRoleClient();
  await admin.from("admin_audit_logs").insert({
    actor_user_id: session.userId,
    action,
    target_type: "referrals",
    target_id: null,
    payload,
  });
}

async function getDefaultProgramSettings(admin: Awaited<ReturnType<typeof createServiceRoleClient>>): Promise<ProgramSettings> {
  const { data } = await admin
    .from("referral_program_settings")
    .select("default_commission_percent, default_commission_months")
    .eq("is_default", true)
    .maybeSingle();

  const row = data as { default_commission_percent?: number | null; default_commission_months?: number | null } | null;
  return {
    default_commission_percent: Number(row?.default_commission_percent ?? 20),
    default_commission_months: Number(row?.default_commission_months ?? 2),
  };
}

async function syncReferralLedger(admin: Awaited<ReturnType<typeof createServiceRoleClient>>) {
  const [settings, partnersResult, attributionsResult, eventsResult, ledgerResult] = await Promise.all([
    getDefaultProgramSettings(admin),
    admin.from("referral_partners").select("id, name, email, phone, referral_code, commission_percent_override, commission_months_override, is_active"),
    admin.from("referral_attributions").select("id, shop_id, partner_id, commission_percent_snapshot, commission_months_snapshot"),
    admin
      .from("shop_billing_events")
      .select("id, shop_id, created_at, payload")
      .eq("event_type", "subscription_payment_applied")
      .order("created_at", { ascending: true }),
    admin.from("referral_commission_ledger").select("id, billing_event_id"),
  ]);

  const partners = (partnersResult.data || []) as PartnerRow[];
  const attributions = (attributionsResult.data || []) as AttributionRow[];
  const events = (eventsResult.data || []) as BillingEventRow[];
  const existingLedger = (ledgerResult.data || []) as Array<{ id: string; billing_event_id: string }>;

  const existingBillingEventIds = new Set(existingLedger.map((l) => l.billing_event_id));
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const attributionByShop = new Map(attributions.map((a) => [a.shop_id, a]));
  const eventsByShop = new Map<string, BillingEventRow[]>();

  for (const event of events) {
    const list = eventsByShop.get(event.shop_id) || [];
    list.push(event);
    eventsByShop.set(event.shop_id, list);
  }

  const monthlyBase = BILLING_PRICES.monthly;
  const inserts: Array<Record<string, unknown>> = [];

  for (const [shopId, shopEvents] of eventsByShop) {
    const attribution = attributionByShop.get(shopId);
    if (!attribution) continue;

    const partner = partnerById.get(attribution.partner_id);
    if (!partner) continue;

    const commissionPercent = Number(
      attribution.commission_percent_snapshot ||
      partner.commission_percent_override ||
      settings.default_commission_percent,
    );
    const commissionMonths = Number(
      attribution.commission_months_snapshot ||
      partner.commission_months_override ||
      settings.default_commission_months,
    );

    const ordered = [...shopEvents].sort((a, b) => a.created_at.localeCompare(b.created_at));
    ordered.forEach((event, index) => {
      if (existingBillingEventIds.has(event.id)) return;
      const paymentSequence = index + 1;
      if (paymentSequence > commissionMonths) return;

      const paymentDate = new Date(event.created_at);
      const commissionAmount = Number(((monthlyBase * commissionPercent) / 100).toFixed(2));
      inserts.push({
        partner_id: attribution.partner_id,
        shop_id: attribution.shop_id,
        billing_event_id: event.id,
        payment_id: event.payload?.payment_id || null,
        payment_applied_at: event.created_at,
        payment_sequence: paymentSequence,
        period_ym: toYm(paymentDate),
        base_amount: monthlyBase,
        commission_percent: commissionPercent,
        commission_amount: commissionAmount,
        status: "pending",
      });
    });
  }

  if (inserts.length > 0) {
    await admin.from("referral_commission_ledger").upsert(inserts, {
      onConflict: "billing_event_id",
      ignoreDuplicates: true,
    });
  }

  return {
    inserted: inserts.length,
  };
}

export async function syncReferralLedgerInternal(): Promise<{ inserted: number }> {
  const admin = await createServiceRoleClient();
  return syncReferralLedger(admin);
}

export async function fetchReferralsAdminOverview(): Promise<ReferralsAdminOverview> {
  await requireSuperAdmin();
  const admin = await createServiceRoleClient();

  const [settings, partnersResult, attributionsResult, shopsResult, ledgerResult, payoutsResult] = await Promise.all([
    getDefaultProgramSettings(admin),
    admin.from("referral_partners").select("id, name, email, phone, referral_code, commission_percent_override, commission_months_override, is_active").order("created_at", { ascending: true }),
    admin.from("referral_attributions").select("shop_id, partner_id, commission_percent_snapshot, commission_months_snapshot"),
    admin.from("shops").select("id, nombre, slug, industry"),
    admin.from("referral_commission_ledger").select("id, partner_id, shop_id, billing_event_id, payment_applied_at, payment_sequence, commission_amount, commission_percent, status, payout_id"),
    admin.from("referral_commission_payouts").select("id, partner_id, paid_at, amount, status, created_at").order("created_at", { ascending: false }),
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
    const pending = shopLedger.filter((l) => l.status === "pending").reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
    return {
      shopId: attr.shop_id,
      shopName: shop?.nombre || "Local",
      shopSlug: shop?.slug || "-",
      industryName: shop ? INDUSTRY_CONFIG[resolveIndustry(shop.industry)].displayName : "-",
      partnerName: partner?.name || "-",
      commissionPercent: Number(attr.commission_percent_snapshot),
      commissionMonths: Number(attr.commission_months_snapshot),
      paymentsTracked: shopLedger.length,
      pendingCommission: Number(pending.toFixed(2)),
    };
  });

  const partnersSummary: PartnerSummary[] = partners.map((partner) => {
    const partnerAttributions = attributions.filter((a) => a.partner_id === partner.id);
    const partnerLedger = ledger.filter((l) => l.partner_id === partner.id);
    const rulePercent = Number(partner.commission_percent_override ?? settings.default_commission_percent);
    const ruleMonths = Number(partner.commission_months_override ?? settings.default_commission_months);
    const totalCommissionGenerated = partnerLedger.reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
    const pendingCommission = partnerLedger.filter((l) => l.status === "pending").reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
    const paidCommission = partnerLedger.filter((l) => l.status === "paid").reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);

    return {
      partnerId: partner.id,
      partnerName: partner.name,
      partnerEmail: partner.email,
      referralCode: partner.referral_code,
      isActive: partner.is_active,
      rulePercent,
      ruleMonths,
      referredShops: partnerAttributions.length,
      totalRevenueTracked: partnerLedger.length * BILLING_PRICES.monthly,
      totalCommissionGenerated: Number(totalCommissionGenerated.toFixed(2)),
      pendingCommission: Number(pendingCommission.toFixed(2)),
      paidCommission: Number(paidCommission.toFixed(2)),
    };
  });

  const pendingCommission = ledger.filter((l) => l.status === "pending").reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
  const paidCommission = ledger.filter((l) => l.status === "paid").reduce((acc, item) => acc + Number(item.commission_amount || 0), 0);
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
      pendingCommission: Number(pendingCommission.toFixed(2)),
      paidCommission: Number(paidCommission.toFixed(2)),
    },
    settings,
    partners: partnersSummary,
    referredShops,
    partnerOptions: partners.map((partner) => ({
      id: partner.id,
      name: partner.name,
      email: partner.email,
      phone: partner.phone,
      referralCode: partner.referral_code,
      isActive: partner.is_active,
      commissionPercentOverride: partner.commission_percent_override,
      commissionMonthsOverride: partner.commission_months_override,
    })),
    unattributedShops,
    payouts: payouts.map((payout) => ({
      id: payout.id,
      partnerName: partnerById.get(payout.partner_id)?.name || "Partner",
      amount: Number(payout.amount || 0),
      status: payout.status,
      paidAt: payout.paid_at,
      createdAt: payout.created_at,
    })),
  };
}

export async function syncReferralLedgerNow(): Promise<{ success: boolean; inserted?: number; error?: string }> {
  try {
    await requireSuperAdmin();
    const result = await syncReferralLedgerInternal();
    await appendAdminAudit("referrals.sync_ledger", {
      inserted: result.inserted,
    });
    return { success: true, inserted: result.inserted };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo sincronizar ledger" };
  }
}

export async function updateReferralProgramSettings(input: {
  defaultCommissionPercent: number;
  defaultCommissionMonths: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();

    const percent = Number(input.defaultCommissionPercent);
    const months = Number(input.defaultCommissionMonths);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { success: false, error: "Porcentaje invalido" };
    }
    if (!Number.isFinite(months) || months < 1 || months > 24) {
      return { success: false, error: "Meses invalidos" };
    }

    await admin
      .from("referral_program_settings")
      .update({
        default_commission_percent: Number(percent.toFixed(3)),
        default_commission_months: Math.floor(months),
        updated_at: new Date().toISOString(),
      })
      .eq("is_default", true);

    await appendAdminAudit("referrals.update_program_settings", {
      defaultCommissionPercent: percent,
      defaultCommissionMonths: months,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo guardar configuracion" };
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
  isActive: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();

    const name = input.name.trim();
    const referralCode = input.referralCode.trim().toLowerCase();
    if (!name) return { success: false, error: "Nombre requerido" };
    if (!referralCode) return { success: false, error: "Codigo requerido" };

    const commissionPercentOverride =
      input.commissionPercentOverride === null || input.commissionPercentOverride === undefined
        ? null
        : Number(input.commissionPercentOverride);
    const commissionMonthsOverride =
      input.commissionMonthsOverride === null || input.commissionMonthsOverride === undefined
        ? null
        : Math.floor(Number(input.commissionMonthsOverride));

    if (commissionPercentOverride !== null && (!Number.isFinite(commissionPercentOverride) || commissionPercentOverride < 0 || commissionPercentOverride > 100)) {
      return { success: false, error: "Override de porcentaje invalido" };
    }
    if (commissionMonthsOverride !== null && (!Number.isFinite(commissionMonthsOverride) || commissionMonthsOverride < 1 || commissionMonthsOverride > 24)) {
      return { success: false, error: "Override de meses invalido" };
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

    if (input.partnerId) {
      await admin.from("referral_partners").update(payload).eq("id", input.partnerId);
      await appendAdminAudit("referrals.update_partner", { partnerId: input.partnerId, referralCode });
    } else {
      await admin.from("referral_partners").insert(payload);
      await appendAdminAudit("referrals.create_partner", { referralCode });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo guardar partner" };
  }
}

export async function updateReferralPartnerOverrides(input: {
  partnerId: string;
  commissionPercentOverride?: number | null;
  commissionMonthsOverride?: number | null;
  isActive: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const partnerId = input.partnerId.trim();
    if (!partnerId) return { success: false, error: "Partner invalido" };

    const commissionPercentOverride =
      input.commissionPercentOverride === null || input.commissionPercentOverride === undefined
        ? null
        : Number(input.commissionPercentOverride);
    const commissionMonthsOverride =
      input.commissionMonthsOverride === null || input.commissionMonthsOverride === undefined
        ? null
        : Math.floor(Number(input.commissionMonthsOverride));

    if (commissionPercentOverride !== null && (!Number.isFinite(commissionPercentOverride) || commissionPercentOverride < 0 || commissionPercentOverride > 100)) {
      return { success: false, error: "Override de porcentaje invalido" };
    }
    if (commissionMonthsOverride !== null && (!Number.isFinite(commissionMonthsOverride) || commissionMonthsOverride < 1 || commissionMonthsOverride > 24)) {
      return { success: false, error: "Override de meses invalido" };
    }

    await admin
      .from("referral_partners")
      .update({
        commission_percent_override: commissionPercentOverride,
        commission_months_override: commissionMonthsOverride,
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerId);

    await appendAdminAudit("referrals.update_partner_overrides", {
      partnerId,
      commissionPercentOverride,
      commissionMonthsOverride,
      isActive: input.isActive,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo actualizar partner" };
  }
}

export async function deleteReferralAttribution(shopId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();
    const normalizedShopId = shopId.trim();
    if (!normalizedShopId) return { success: false, error: "Local invalido" };

    await admin.from("referral_attributions").delete().eq("shop_id", normalizedShopId);
    await appendAdminAudit("referrals.unassign_shop", { shopId: normalizedShopId });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo desasignar" };
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

    const partner = partnerResult.data as { id: string; referral_code: string; commission_percent_override: number | null; commission_months_override: number | null } | null;
    if (!partner?.id) return { success: false, error: "Partner no encontrado" };

    const percentSnapshot = Number(partner.commission_percent_override ?? settings.default_commission_percent);
    const monthsSnapshot = Number(partner.commission_months_override ?? settings.default_commission_months);

    const { data: existing } = await admin
      .from("referral_attributions")
      .select("id")
      .eq("shop_id", shopId)
      .maybeSingle();

    const payload = {
      shop_id: shopId,
      partner_id: partnerId,
      attributed_at: new Date().toISOString(),
      referral_code_snapshot: partner.referral_code,
      commission_percent_snapshot: percentSnapshot,
      commission_months_snapshot: monthsSnapshot,
    };

    if (existing?.id) {
      await admin.from("referral_attributions").update(payload).eq("id", existing.id);
    } else {
      await admin.from("referral_attributions").insert(payload);
    }

    await appendAdminAudit("referrals.assign_shop", {
      shopId,
      partnerId,
      commissionPercentSnapshot: percentSnapshot,
      commissionMonthsSnapshot: monthsSnapshot,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo asignar referido" };
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

    const row = Array.isArray(rpcRows) ? rpcRows[0] as { updated_count?: number; total_amount?: number } | undefined : undefined;
    const items = Number(row?.updated_count || 0);
    const amount = Number(row?.total_amount || 0);
    if (items === 0) return { success: true };

    await appendAdminAudit("referrals.mark_partner_paid", {
      partnerId,
      items,
      amount: Number(amount.toFixed(2)),
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo marcar como pagado" };
  }
}
