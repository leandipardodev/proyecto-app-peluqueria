import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { DEFAULT_FEATURES } from "@/lib/industry/types";
import type { Industry, IndustryFeatures } from "@/lib/industry/types";

function parseFeatures(raw: Record<string, boolean> | undefined, industry: Industry): IndustryFeatures {
  const defaults = DEFAULT_FEATURES[industry];
  return {
    inventory: typeof raw?.inventory === "boolean" ? raw.inventory : defaults.inventory,
    marketing: typeof raw?.marketing === "boolean" ? raw.marketing : defaults.marketing,
    staff: typeof raw?.staff === "boolean" ? raw.staff : defaults.staff,
    vouchers: typeof raw?.vouchers === "boolean" ? raw.vouchers : defaults.vouchers,
  };
}

const FEATURE_KEYS: (keyof IndustryFeatures)[] = ["inventory", "marketing", "staff", "vouchers"];

export async function getFeatures(industry: Industry): Promise<IndustryFeatures> {
  try {
    const admin = await createServiceRoleClient();
    const { data, error } = await admin
      .from("industry_config")
      .select("features")
      .eq("industry", industry)
      .maybeSingle();

    if (error || !data?.features) {
      return DEFAULT_FEATURES[industry];
    }

    return parseFeatures(data.features as Record<string, boolean>, industry);
  } catch {
    return DEFAULT_FEATURES[industry];
  }
}

export async function getShopFeatures(shopId: string): Promise<IndustryFeatures> {
  try {
    const admin = await createServiceRoleClient();

    const { data: shop } = await admin
      .from("shops")
      .select("industry, features_override")
      .eq("id", shopId)
      .maybeSingle();

    if (!shop) {
      return DEFAULT_FEATURES.peluqueria;
    }

    const industry = shop.industry as Industry;
    const industryFeatures = await getFeatures(industry);
    const overrides = (shop.features_override ?? {}) as Record<string, boolean>;

    const result = { ...industryFeatures };
    for (const key of FEATURE_KEYS) {
      if (overrides[key] === true) {
        result[key] = true;
      }
    }

    return result;
  } catch {
    return DEFAULT_FEATURES.peluqueria;
  }
}

export async function updateShopFeatureOverride(
  shopId: string,
  feature: keyof IndustryFeatures,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await createServiceRoleClient();

    const { data: shop } = await admin
      .from("shops")
      .select("features_override")
      .eq("id", shopId)
      .maybeSingle();

    if (!shop) {
      return { success: false, error: "Local no encontrado" };
    }

    const currentOverrides = (shop.features_override ?? {}) as Record<string, boolean>;

    if (enabled) {
      currentOverrides[feature] = true;
    } else {
      delete currentOverrides[feature];
    }

    const newOverrides = Object.keys(currentOverrides).length > 0 ? currentOverrides : null;

    const { error } = await admin
      .from("shops")
      .update({ features_override: newOverrides as Record<string, boolean> | null })
      .eq("id", shopId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateFeatures(
  industry: Industry,
  updates: Partial<IndustryFeatures>,
  updatedBy: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await createServiceRoleClient();
    const current = await getFeatures(industry);

    const merged: IndustryFeatures = {
      ...current,
      ...updates,
    };

    const { error } = await admin
      .from("industry_config")
      .upsert(
        {
          industry,
          features: merged as unknown as Record<string, boolean>,
          updated_by: updatedBy,
        },
        { onConflict: "industry" },
      )
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function getAdminIndustryConfigs(): Promise<
  { industry: Industry; features: IndustryFeatures }[]
> {
  try {
    const admin = await createServiceRoleClient();
    const { data, error } = await admin
      .from("industry_config")
      .select("industry, features")
      .order("industry", { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((row) => {
      return {
        industry: row.industry as Industry,
        features: parseFeatures(row.features as Record<string, boolean> | undefined, row.industry as Industry),
      };
    });
  } catch {
    return [];
  }
}
