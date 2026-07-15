import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { getBillingSettings, updateBillingSettings } from "@/lib/admin/site-settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";

  let successMessage = "";
  let errorMessage = "";

  if (status === "saved") successMessage = "Configuración guardada correctamente.";
  if (status === "error") errorMessage = "No se pudieron guardar los cambios.";

  const settings = await getBillingSettings();

  async function handleSave(formData: FormData) {
    "use server";
    const session = await requireSuperAdmin();

    const price = Number(formData.get("monthly_price"));
    const trialDays = Number(formData.get("trial_days"));

    if (!price || price <= 0 || !trialDays || trialDays <= 0) {
      redirect("/admin/settings?status=error");
    }

    const result = await updateBillingSettings(price, trialDays, session.userId);

    revalidatePath("/admin/settings");
    revalidatePath("/");
    redirect(`/admin/settings?status=${result.success ? "saved" : "error"}`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-800">
            &larr; Volver a admin
          </Link>
          <h2 className="mt-1 text-2xl font-bold">Configuración</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ajustá precios, periods de prueba y otros parámetros globales.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <form action={handleSave} className="max-w-lg space-y-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Facturación</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Estos valores se usan en el checkout, landing page, emails de dunning y métricas del admin.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="monthly_price" className="block text-sm font-medium text-zinc-700">
                Precio mensual (ARS)
              </label>
              <input
                type="number"
                id="monthly_price"
                name="monthly_price"
                defaultValue={settings.monthly_price}
                min={0}
                step={500}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Se muestra como ${settings.monthly_price.toLocaleString("es-AR")} en la landing y checkout.
              </p>
            </div>

            <div>
              <label htmlFor="trial_days" className="block text-sm font-medium text-zinc-700">
                Días de prueba gratis
              </label>
              <input
                type="number"
                id="trial_days"
                name="trial_days"
                defaultValue={settings.trial_days}
                min={0}
                max={90}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Días que el local opera gratis antes de necesitar pago.
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          Guardar cambios
        </button>
      </form>
    </div>
  );
}
