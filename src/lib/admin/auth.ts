import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AdminSession = {
  userId: string;
  email: string | null;
  platformRole: string | null;
};

export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("platform_role, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const platformRole =
    (profile as { platform_role?: string | null; role?: string | null } | null)?.platform_role ||
    (((profile as { role?: string | null } | null)?.role === "superadmin") ? "super_admin" : "user");

  if (platformRole !== "super_admin") return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
  };
}

export async function requireSuperAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/dashboard");
  }
  return session;
}
