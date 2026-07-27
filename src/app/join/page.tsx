import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { verifyStaffInviteToken } from "@/lib/dashboard/staff/staff-invite";
import { StaffSetupForm } from "./staff-setup-form";
import JoinMessageClient from "./join-message-client";

export default async function JoinPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = (params?.token || "").trim();

  if (!token) {
    return <JoinMessageClient title="Invitacion invalida" text="Falta el token de invitacion." />;
  }

  const invite = verifyStaffInviteToken(token);
  if (!invite) {
    return <JoinMessageClient title="Invitacion vencida" text="Este enlace no es valido o ya vencio." />;
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
    return <JoinMessageClient title="Email incorrecto" text="Inicia sesion con el email que recibio la invitacion." />;
  }

  const admin = await createServiceRoleClient();

  const { data: shop } = await admin
    .from("shops")
    .select("id, slug")
    .eq("id", invite.shopId)
    .maybeSingle();

  if (!shop?.id || !shop.slug) {
    return <JoinMessageClient title="Local no encontrado" text="El local asociado a esta invitacion ya no existe." />;
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
