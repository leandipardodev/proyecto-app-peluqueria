import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { verifyStaffInviteToken } from "@/lib/dashboard/staff/staff-invite";
import { StaffSetupForm } from "./staff-setup-form";
import { logout } from "@/lib/dashboard/auth/logout-action";

export default async function JoinPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = (params?.token || "").trim();

  if (!token) {
    return <JoinMessage title="Invitacion invalida" text="Falta el token de invitacion." />;
  }

  const invite = verifyStaffInviteToken(token);
  if (!invite) {
    return <JoinMessage title="Invitacion vencida" text="Este enlace no es valido o ya vencio." />;
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <StaffSetupForm token={token} name={""} />;
  }

  const userEmail = (user.email || "").trim().toLowerCase();
  if (!userEmail || userEmail !== invite.email) {
    return <JoinMessage title="Email incorrecto" text="Inicia sesion con el email que recibio la invitacion." />;
  }

  const admin = await createServiceRoleClient();

  const { data: shop } = await admin
    .from("shops")
    .select("id, slug")
    .eq("id", invite.shopId)
    .maybeSingle();

  if (!shop?.id || !shop.slug) {
    return <JoinMessage title="Local no encontrado" text="El local asociado a esta invitacion ya no existe." />;
  }

  await admin.from("shop_memberships").upsert(
    {
      user_id: user.id,
      shop_id: shop.id,
      role: invite.role,
      is_active: true,
      invite_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,shop_id" }
  );

  await admin.from("user_profiles").upsert(
    {
      user_id: user.id,
      shop_id: shop.id,
      name: user.user_metadata?.full_name || user.email || "Staff",
      email: invite.email,
      role: invite.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,shop_id" }
  );

  await admin.from("admin_allowlist").upsert(
    {
      email: invite.email,
      shop_id: shop.id,
      role: invite.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email" }
  );

  redirect(`/dashboard/${shop.slug}`);
}

function JoinMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2rem] border border-white/10 dark:border-white/5 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{text}</p>
        <div className="mt-5 flex flex-col gap-3">
          <Link href="/login" className="inline-flex items-center justify-center rounded-xl bg-violet-600 text-white px-4 py-2 text-sm">
            Ir a login
          </Link>
          <form action={logout}>
            <button type="submit" className="w-full inline-flex items-center justify-center rounded-xl border border-zinc-300 text-zinc-700 px-4 py-2 text-sm hover:bg-zinc-50 cursor-pointer">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
