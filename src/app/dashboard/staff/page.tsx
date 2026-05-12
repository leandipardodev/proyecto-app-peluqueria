import { fetchStaffMembers } from "@/lib/dashboard/staff-actions";
import StaffList from "@/components/staff/staff-list";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  let staff: any[] = [];

  const result = await fetchStaffMembers();
  if (result.success) {
    staff = result.data ?? [];
  } else {
    console.error("[StaffPage] Error:", result.error);
  }

  return <StaffList initialStaff={staff} />;
}
