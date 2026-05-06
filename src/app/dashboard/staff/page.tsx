import { fetchStaffMembers } from "@/lib/dashboard/staff-actions";
import StaffList from "@/components/staff/staff-list";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  let staff: Awaited<ReturnType<typeof fetchStaffMembers>> = [];

  try {
    staff = await fetchStaffMembers();
  } catch {
    staff = [];
  }

  return <StaffList initialStaff={staff} />;
}
