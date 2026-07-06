import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ClientSidebar from "@/components/client/client-sidebar";
import { getTenantAndUser } from "@/lib/dashboard/shared/get-tenant-and-user";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user profile to check if they are a customer
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, shop_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // If not a customer role, redirect to main dashboard
  if (!profile || profile.role !== "customer") {
    redirect("/dashboard");
  }

  const { shopName, userName } = await getTenantAndUser();

  return (
    <div className="flex h-screen bg-transparent">
      <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
        <ClientSidebar userName={userName} shopName={shopName} />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
