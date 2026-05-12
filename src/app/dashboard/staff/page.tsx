import { fetchStaffMembers } from "@/lib/dashboard/staff-actions";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StaffList from "@/components/staff/staff-list";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  let staff: any[] = [];

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await fetchStaffMembers();
  if (result.success) {
    staff = result.data ?? [];
  } else {
    console.error("[StaffPage] Error:", result.error);
  }

  return <StaffList initialStaff={staff} currentUserId={user.id} />;
}
