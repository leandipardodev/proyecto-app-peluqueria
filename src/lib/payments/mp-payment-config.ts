import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const MP_EXCLUDABLE_PAYMENT_TYPES = [
  { id: "credit_card", label: "Tarjetas de credito", hint: "Comision ~7%" },
  { id: "debit_card", label: "Tarjetas de debito", hint: "Comision ~4%" },
  { id: "prepaid_card", label: "Tarjetas prepagas", hint: "Comision ~4%" },
  { id: "account_money", label: "Saldo en cuenta Mercado Pago", hint: "Comision ~1-2%" },
] as const;

export type MpExcludablePaymentType = (typeof MP_EXCLUDABLE_PAYMENT_TYPES)[number]["id"];

export type MpPaymentConfig = {
  maxInstallments: number | null;
  excludedPaymentTypes: MpExcludablePaymentType[];
};

export type MpPaymentMethodsConfig = {
  installments?: number;
  excluded_payment_types?: Array<{ id: string }>;
};

export const MP_MAX_INSTALLMENTS_CAP = 24;

const ALLOWED_EXCLUDABLE = new Set<string>(MP_EXCLUDABLE_PAYMENT_TYPES.map((t) => t.id));

export function normalizeMpPaymentConfig(raw: {
  mp_max_installments?: unknown;
  mp_excluded_payment_types?: unknown;
}): MpPaymentConfig {
  const max = Number(raw?.mp_max_installments);
  const maxInstallments =
    Number.isFinite(max) && max >= 1 && max <= MP_MAX_INSTALLMENTS_CAP ? Math.floor(max) : null;

  const rawExcluded = raw?.mp_excluded_payment_types;
  const excludedPaymentTypes = Array.isArray(rawExcluded)
    ? rawExcluded.filter(
        (v): v is MpExcludablePaymentType => typeof v === "string" && ALLOWED_EXCLUDABLE.has(v)
      )
    : [];

  return { maxInstallments, excludedPaymentTypes };
}

export function buildMpPaymentMethods(
  config?: Partial<MpPaymentConfig> | null
): MpPaymentMethodsConfig | undefined {
  const max = Number(config?.maxInstallments);
  const maxInstallments =
    Number.isFinite(max) && max >= 1 && max <= MP_MAX_INSTALLMENTS_CAP ? Math.floor(max) : null;

  const excluded = (config?.excludedPaymentTypes ?? []).filter(
    (id): id is MpExcludablePaymentType => ALLOWED_EXCLUDABLE.has(id)
  );

  if (!maxInstallments && excluded.length === 0) return undefined;

  return {
    ...(maxInstallments ? { installments: maxInstallments } : {}),
    ...(excluded.length > 0 ? { excluded_payment_types: excluded.map((id) => ({ id })) } : {}),
  };
}

export async function fetchShopMpPaymentConfig(
  admin: Pick<SupabaseClient<Database>, "from">,
  shopId: string
): Promise<MpPaymentConfig> {
  if (!shopId) return { maxInstallments: null, excludedPaymentTypes: [] };

  const { data } = await admin
    .from("shops")
    .select("mp_max_installments, mp_excluded_payment_types")
    .eq("id", shopId)
    .maybeSingle();

  return normalizeMpPaymentConfig(data ?? {});
}
