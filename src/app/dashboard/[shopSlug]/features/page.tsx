import { getCachedUser, getCachedShopIdBySlug, createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";
import { resolveIndustry } from "@/lib/industry/resolve";
import { getFeatures, getShopFeatures, updateShopFeatureOverride } from "@/lib/industry/features";
import type { IndustryFeatures } from "@/lib/industry/types";
import { FEATURE_LABELS } from "./constants";
import FeaturesToggle from "./features-toggle";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function DashboardShopFeaturesPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const admin = await createServiceRoleClient();
  const { data: shop } = await admin
    .from("shops")
    .select("industry, features_override, nombre")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop) redirect(`/dashboard/${shopSlug}`);

  const industry = resolveIndustry(shop.industry);
  const industryFeatures = await getFeatures(industry);
  const shopFeatures = await getShopFeatures(shopId);
  const overrides = (shop.features_override ?? {}) as Record<string, boolean>;
  const safeShopId = shopId as string;

  async function handleToggle(formData: FormData) {
    "use server";
    const feature = formData.get("feature") as string;
    const enabled = formData.get("enabled") === "true";

    const result = await updateShopFeatureOverride(safeShopId, feature as keyof IndustryFeatures, enabled);

    revalidatePath(`/dashboard/${shopSlug}/features`);
    if (!result.success) {
      redirect(`/dashboard/${shopSlug}/features?error=${encodeURIComponent(result.error || "")}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Funcionalidades del local</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Activá funcionalidades extras para <strong>{shop?.nombre || "tu local"}</strong>.
          {industry !== "peluqueria" && " Algunas funciones están desactivadas por rubro pero podés habilitarlas acá."}
        </p>
      </div>

      <div className="space-y-3">
        {(["inventory", "marketing", "staff", "vouchers"] as const).map((key) => {
          const industryEnabled = industryFeatures[key];
          const shopEnabled = shopFeatures[key];
          const isOverridden = overrides[key] === true;

          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{FEATURE_LABELS[key].label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{FEATURE_LABELS[key].description}</p>
                {!industryEnabled && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    Desactivado por rubro
                  </span>
                )}
                {isOverridden && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                    Activado para este local
                  </span>
                )}
              </div>
              <FeaturesToggle
                feature={key}
                disabled={industryEnabled && !isOverridden}
                enabled={shopEnabled}
                industryEnabled={industryEnabled}
                handleToggle={handleToggle}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-zinc-400">
        Si la función está activa por rubro, no se puede desactivar para un local en particular.
        Solo podés activar funciones que están desactivadas a nivel rubro.
      </p>
    </div>
  );
}
