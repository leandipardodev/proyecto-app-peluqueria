import Link from "next/link";
import Image from "next/image";
import { Nunito } from "next/font/google";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import BillingRequiredClient from "./billing-required-client";

const nunito = Nunito({ subsets: ["latin"], weight: ["700", "800"] });

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
      <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-gray-600">Solo el owner del local puede renovar la membresía.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">Volver al login</Link>
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
    <div className="min-h-screen bg-white pt-8 md:pt-12">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6">
        <div className="space-y-7">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700">Seguimos metiéndole juntos</p>
          <h1 className="text-4xl md:text-6xl font-black tracking-[-0.045em] leading-[0.9] text-zinc-900">
            ¡Qué lindo tenerte
            <span className="mx-2 inline-block -rotate-2 bg-orange-500 px-2 text-white">ACÁ</span>
            <span className="block">una vez más! 😂</span>
          </h1>

          <p className="inline-block -rotate-1 border-2 border-orange-700 bg-white px-4 py-2 text-sm md:text-base font-black text-orange-800 shadow-[6px_6px_0px_0px_rgba(194,65,12,0.75)]">
            Tu día a día merece que todo funcione de diez
          </p>

          <p className={`${nunito.className} max-w-3xl text-lg md:text-xl text-zinc-800 leading-relaxed font-extrabold`}>
            Nos encanta trabajar con vos, turno a turno.
          </p>

          <p className={`${nunito.className} text-base text-zinc-700 font-extrabold`}>
            Hacé la renovación para que siga todo prendido y funcionando de diez.
          </p>

          {expiry && (
            <div className="relative overflow-hidden rounded-3xl border-2 border-orange-600 bg-gradient-to-r from-orange-100 via-amber-100 to-orange-200 px-5 py-4 text-sm text-orange-950 shadow-[0_10px_26px_rgba(234,88,12,0.32)]">
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/45" />
              <p className="font-black tracking-wide text-base">Renová tu plan</p>
              <p className="mt-1 text-xs text-orange-900">
                Se venció el {expiry.toLocaleDateString("es-AR")} y te segundeamos con unos días hasta el {graceUntil?.toLocaleDateString("es-AR")}.
              </p>
            </div>
          )}

          <BillingRequiredClient shopId={shop?.id || selectedShopId} shopName={shop?.nombre || "Mi local"} />

          <p className={`${nunito.className} text-center text-2xl md:text-3xl font-extrabold tracking-tight text-orange-700`}>
            Seguimos haciéndote la dos en cada turno.
          </p>

          <div className="pt-1 pb-2">
            <a href="mailto:soporte@klip.app" className="text-xs text-zinc-500 hover:text-zinc-700">¿Necesitás ayuda? soporte@klip.app</a>
          </div>
        </div>
      </div>

      <div className="relative w-screen left-1/2 -translate-x-1/2 bg-white">
        <Image
          src="/imagen-pago-dos.webp"
          alt="Ilustración de pago de membresía"
          width={2200}
          height={900}
          className="block h-auto w-full object-cover"
          priority
        />
      </div>
    </div>
  );
}
