import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CreateShopRecoveryClient from "./recovery-client";

export const dynamic = "force-dynamic";

export default async function CreateShopRecoveryPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <CreateShopRecoveryClient userEmail={user.email || ""} />;
}
