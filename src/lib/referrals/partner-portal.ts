import "server-only";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { cookies } from "next/headers";
import {
  PARTNER_SESSION_COOKIE,
  clearLoginFailures,
  createPartnerSessionToken,
  getIpLockRemainingMs,
  isValidPinShape,
  normalizePin,
  registerLoginFailure,
  verifyPartnerSessionToken,
  verifyPin,
} from "@/lib/referrals/partner-auth";

export type PartnerPortalShop = {
  shopId: string;
  shopName: string;
  attributedAt: string;
  commissionPercent: number;
  commissionMonths: number;
  paymentsTracked: number;
  monthsPaid: number;
  commissionGenerated: number;
  commissionPending: number;
  commissionPaid: number;
};

export type PartnerLostShop = {
  shopId: string;
  shopName: string;
  takenByName: string;
  visitedAt: string;
};

export type PartnerDashboard = {
  partnerId: string;
  partnerName: string;
  referralCode: string;
  commissionPercent: number;
  commissionMonths: number;
  payoutAlias: string | null;
  payoutCbu: string | null;
  shops: PartnerPortalShop[];
  lostShops: PartnerLostShop[];
  totals: {
    shops: number;
    monthsPaid: number;
    commissionGenerated: number;
    commissionPending: number;
    commissionPaid: number;
  };
  generatedAt: string;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export async function getPartnerSession(): Promise<{ partnerId: string } | null> {
  const store = await cookies();
  const session = verifyPartnerSessionToken(store.get(PARTNER_SESSION_COOKIE)?.value);
  return session ? { partnerId: session.partnerId } : null;
}

export async function getPartnerDashboard(partnerId: string): Promise<PartnerDashboard | null> {
  if (!partnerId) return null;
  const admin = await createServiceRoleClient();

  const { data: partner } = await admin
    .from("referral_partners")
    .select(
      "id, name, referral_code, commission_percent_override, commission_months_override, payout_alias, payout_cbu",
    )
    .eq("id", partnerId)
    .maybeSingle();

  if (!partner) return null;

  const [settingsResult, attributionsResult, ledgerResult, clicksResult, shopsResult] = await Promise.all([
    admin
      .from("referral_program_settings")
      .select("default_commission_percent, default_commission_months")
      .eq("is_default", true)
      .maybeSingle(),
    admin
      .from("referral_attributions")
      .select("shop_id, attributed_at, commission_percent_snapshot, commission_months_snapshot")
      .eq("partner_id", partnerId),
    admin
      .from("referral_commission_ledger")
      .select("id, shop_id, commission_amount, payment_sequence, status")
      .eq("partner_id", partnerId),
    admin
      .from("referral_link_clicks")
      .select("shop_id, outcome, created_at")
      .eq("partner_id", partnerId)
      .eq("outcome", "already_taken")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("shops").select("id, nombre"),
  ]);

  const settings = (settingsResult.data as
    | { default_commission_percent?: number; default_commission_months?: number }
    | null) ?? {};

  const attributions = (attributionsResult.data || []) as Array<{
    shop_id: string;
    attributed_at: string;
    commission_percent_snapshot: number;
    commission_months_snapshot: number;
  }>;

  const ledger = (ledgerResult.data || []) as Array<{
    id: string;
    shop_id: string;
    commission_amount: number;
    payment_sequence: number;
    status: string;
  }>;

  const clicks = (clicksResult.data || []) as Array<{
    shop_id: string | null;
    outcome: string;
    created_at: string;
  }>;

  const shopNameById = new Map(
    ((shopsResult.data || []) as Array<{ id: string; nombre: string }>).map((s) => [s.id, s.nombre || "Local"]),
  );

  const shops: PartnerPortalShop[] = attributions.map((attr) => {
    const shopLedger = ledger.filter((l) => l.shop_id === attr.shop_id);
    const sum = (rows: typeof shopLedger) =>
      round2(rows.reduce((acc, item) => acc + Number(item.commission_amount || 0), 0));

    return {
      shopId: attr.shop_id,
      shopName: shopNameById.get(attr.shop_id) || "Local",
      attributedAt: attr.attributed_at,
      commissionPercent: Number(attr.commission_percent_snapshot),
      commissionMonths: Number(attr.commission_months_snapshot),
      paymentsTracked: shopLedger.length,
      monthsPaid: shopLedger.length,
      commissionGenerated: sum(shopLedger),
      commissionPending: sum(shopLedger.filter((l) => l.status === "pending")),
      commissionPaid: sum(shopLedger.filter((l) => l.status === "paid")),
    };
  });

  shops.sort((a, b) => b.attributedAt.localeCompare(a.attributedAt));

  // Los locales que otro vendedor se quedo. Solo se muestran los que existen
  // todavia en shops: si el local fue borrado no hay nada que ver.
  const lostShopIds = Array.from(
    new Set(
      clicks
        .map((c) => c.shop_id)
        .filter((id): id is string => Boolean(id) && shopNameById.has(id as string)),
    ),
  );

  const lostShops: PartnerLostShop[] = lostShopIds.length
    ? await (async () => {
        const { data: losers } = await admin
          .from("referral_link_clicks")
          .select("shop_id, created_at")
          .eq("partner_id", partnerId)
          .eq("outcome", "already_taken")
          .in("shop_id", lostShopIds)
          .order("created_at", { ascending: false });

        const { data: owners } = await admin
          .from("referral_attributions")
          .select("shop_id, partner_id")
          .in("shop_id", lostShopIds);

        const ownerIdByShop = new Map(
          ((owners || []) as Array<{ shop_id: string; partner_id: string }>).map((r) => [
            r.shop_id,
            r.partner_id,
          ]),
        );

        const otherPartnerIds = Array.from(new Set(ownerIdByShop.values())).filter(
          (id) => id !== partnerId,
        );
        const { data: others } = otherPartnerIds.length
          ? await admin.from("referral_partners").select("id, name").in("id", otherPartnerIds)
          : { data: [] as Array<{ id: string; name: string }> };

        const otherNameById = new Map(
          ((others || []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]),
        );

        return (((losers || []) as Array<{ shop_id: string | null; created_at: string }>)
          .filter((row): row is { shop_id: string; created_at: string } => Boolean(row.shop_id))
          .map((row) => ({
            shopId: row.shop_id,
            shopName: shopNameById.get(row.shop_id) || "Local",
            takenByName: otherNameById.get(ownerIdByShop.get(row.shop_id) || "") || "otro vendedor",
            visitedAt: row.created_at,
          })));
      })()
    : [];

  const dedupedLost = Array.from(
    new Map(lostShops.map((item) => [item.shopId, item])).values(),
  ).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));

  const totalGenerated = round2(ledger.reduce((acc, l) => acc + Number(l.commission_amount || 0), 0));
  const totalPending = round2(
    ledger.filter((l) => l.status === "pending").reduce((acc, l) => acc + Number(l.commission_amount || 0), 0),
  );
  const totalPaid = round2(
    ledger.filter((l) => l.status === "paid").reduce((acc, l) => acc + Number(l.commission_amount || 0), 0),
  );

  return {
    partnerId: partner.id,
    partnerName: partner.name,
    referralCode: partner.referral_code,
    commissionPercent: Number(
      partner.commission_percent_override ?? settings.default_commission_percent ?? 100,
    ),
    commissionMonths: Number(
      partner.commission_months_override ?? settings.default_commission_months ?? 2,
    ),
    payoutAlias: partner.payout_alias,
    payoutCbu: partner.payout_cbu,
    shops,
    lostShops: dedupedLost,
    totals: {
      shops: shops.length,
      monthsPaid: ledger.length,
      commissionGenerated: totalGenerated,
      commissionPending: totalPending,
      commissionPaid: totalPaid,
    },
    generatedAt: new Date().toISOString(),
  };
}

export type PartnerLoginResult =
  | { ok: true; token: string; partnerName: string; referralCode: string }
  | { ok: false; error: string };

/**
 * Valida codigo + PIN. A proposito NO dice si el codigo existe o el PIN esta
 * mal: mismo mensaje para los dos casos, asi no se puede enumerar quienes son
 * los vendedores de Klip.
 */
export async function authenticatePartner(
  code: string,
  pin: string,
  ip: string,
): Promise<PartnerLoginResult> {
  const genericError = "Codigo o PIN incorrecto";

  const lockMs = await getIpLockRemainingMs(ip);
  if (lockMs > 0) {
    const minutes = Math.ceil(lockMs / 60000);
    return {
      ok: false,
      error: `Demasiados intentos. Reintenta en ${minutes >= 60 ? `${Math.ceil(minutes / 60)} h` : `${minutes} min`}.`,
    };
  }

  const normalizedCode = code.trim().toLowerCase();
  const normalizedPin = normalizePin(pin);

  if (!normalizedCode || !isValidPinShape(normalizedPin)) {
    await registerLoginFailure(ip);
    return { ok: false, error: genericError };
  }

  const admin = await createServiceRoleClient();
  const { data: partner } = await admin
    .from("referral_partners")
    .select("id, name, referral_code, pin_hash, is_active")
    .eq("referral_code", normalizedCode)
    .maybeSingle();

  const stored = (partner as { pin_hash?: string | null } | null)?.pin_hash ?? null;
  const pinMatches = await verifyPin(normalizedPin, stored);

  if (!partner || !pinMatches) {
    await registerLoginFailure(ip);
    return { ok: false, error: genericError };
  }

  if (!partner.is_active) {
    return { ok: false, error: "Tu cuenta esta desactivada. Contacta a Klip." };
  }

  await clearLoginFailures(ip);
  return {
    ok: true,
    token: createPartnerSessionToken(partner.id),
    partnerName: partner.name,
    referralCode: partner.referral_code,
  };
}
