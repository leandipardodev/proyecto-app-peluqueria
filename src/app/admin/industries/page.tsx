import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { getAdminIndustryConfigs, updateFeatures } from "@/lib/industry/features";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { INDUSTRIES } from "@/lib/industry/types";
import type { Industry } from "@/lib/industry/types";
import IndustryToggle from "./industry-toggle";

export const dynamic = "force-dynamic";

export default async function AdminIndustriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSuperAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";

  let successMessage = "";
  let errorMessage = "";

  if (status === "saved") successMessage = "Features actualizados correctamente.";
  if (status.startsWith("error_")) errorMessage = "No se pudieron guardar los cambios.";

  const configs = await getAdminIndustryConfigs();

  async function handleToggle(formData: FormData) {
    "use server";
    await requireSuperAdmin();

    const industry = formData.get("industry") as Industry | null;
    const feature = formData.get("feature") as string | null;
    const value = formData.get("value") === "true";

    if (!industry || !feature || !INDUSTRIES.includes(industry)) {
      redirect("/admin/industries?status=error_invalid");
    }

    const result = await updateFeatures(industry, { [feature]: value } as any, session.userId);

    revalidatePath("/admin/industries");
    revalidatePath("/dashboard", "layout");
    redirect(`/admin/industries?status=${result.success ? "saved" : "error_save"}`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-800">
            &larr; Volver a admin
          </Link>
          <h2 className="mt-1 text-2xl font-bold">Industrias y Features</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Activa o desactiva funcionalidades por rubro. Los cambios se aplican en toda la plataforma.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-[0.05em] text-zinc-500">
              <th className="px-5 py-3">Industria</th>
              <th className="px-5 py-3 text-center">Inventory (Stock)</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((cfg) => {
              const info = INDUSTRY_CONFIG[cfg.industry];
              return (
                <tr key={cfg.industry} className="border-b border-zinc-100 last:border-0">
                  <td className="px-5 py-4 font-medium">{info.displayName}</td>
                  <td className="px-5 py-4 text-center">
                    <IndustryToggle
                      industry={cfg.industry}
                      feature="inventory"
                      enabled={cfg.features.inventory}
                      handleToggle={handleToggle}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Los valores por defecto se aplican si no hay configuracion en la base de datos.
      </p>
    </div>
  );
}
