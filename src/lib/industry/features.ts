import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { DEFAULT_FEATURES } from "@/lib/industry/types";
import type { Industry, IndustryFeatures } from "@/lib/industry/types";

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

    const parsed = data.features as Record<string, boolean>;
    return {
      inventory: typeof parsed.inventory === "boolean" ? parsed.inventory : DEFAULT_FEATURES[industry].inventory,
    };
  } catch {
    return DEFAULT_FEATURES[industry];
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
      const parsed = row.features as Record<string, boolean> | undefined;
      return {
        industry: row.industry as Industry,
        features: {
          inventory:
            typeof parsed?.inventory === "boolean"
              ? parsed.inventory
              : DEFAULT_FEATURES[row.industry as Industry]?.inventory ?? false,
        },
      };
    });
  } catch {
    return [];
  }
}
