import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import BillingRequiredClient from "./billing-required-client";

export default async function BillingRequiredPage({
  searchParams,
}: {
  searchParams?: Promise<{ shop_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = await createServiceRoleClient();
  const { data: memberships } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("role", "owner")
    .limit(20);

  const ownerShopIds = (memberships || []).map((m) => m.shop_id);
  if (ownerShopIds.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center bg-white/20 backdrop-blur-2xl rounded-[2rem] border border-white/20 p-8">
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-gray-600">Solo el owner del local puede renovar la membresia.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-xl border border-gray-300 px-4 py-2 text-sm">Volver al login</Link>
        </div>
      </div>
    );
  }

  const selectedShopId = params?.shop_id && ownerShopIds.includes(params.shop_id)
    ? params.shop_id
    : ownerShopIds[0];

  const { data: shop } = await admin
    .from("shops")
    .select("id, nombre, plan_expiry")
    .eq("id", selectedShopId)
    .single();

  const expiry = shop?.plan_expiry ? new Date(shop.plan_expiry) : null;
  const graceUntil = expiry ? new Date(expiry.getTime() + 2 * 24 * 60 * 60 * 1000) : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Membresia vencida</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">Tu acceso al dashboard se reactiva automaticamente al aprobar el pago.</p>
        {expiry && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 p-3 text-xs text-amber-800 dark:text-amber-200">
            Vencimiento: {expiry.toLocaleDateString("es-AR")} - Gracia de 2 dias hasta {graceUntil?.toLocaleDateString("es-AR")}.
          </div>
        )}

        <BillingRequiredClient shopId={shop?.id || selectedShopId} shopName={shop?.nombre || "Mi local"} />

        <div className="pt-1">
          <a href="mailto:soporte@klip.app" className="text-xs text-gray-500 hover:text-gray-700">Necesitas ayuda? soporte@klip.app</a>
        </div>
      </div>
    </div>
  );
}
