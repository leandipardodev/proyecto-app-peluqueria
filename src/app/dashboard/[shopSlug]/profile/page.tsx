import DashboardProfilePage from "@/app/dashboard/profile/page";

export const dynamic = "force-dynamic";

export default async function DashboardShopProfilePage() {
  return await DashboardProfilePage();
}
