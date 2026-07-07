import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/dashboard/auth/server";
import { redirect } from "next/navigation";
import BookingFlow from "@/components/client/booking-flow";
import { fetchPublicStaff } from "@/lib/dashboard/clients/actions";

interface ClientBookPageProps {
  searchParams: Promise<{ serviceId?: string; staffId?: string }>;
}

type StaffMemberWithProfile = { user_id: string; name: string; photo_url?: string | null; description?: string | null; instagram?: string | null; whatsapp?: string | null };

export const dynamic = "force-dynamic";

export default async function ClientBookPage({ searchParams }: ClientBookPageProps) {
  const { serviceId, staffId } = await searchParams;
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const supabase = await createServerClient();

  // Get shop from user's profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!profile?.shop_id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reservar Turno</h1>
        <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-sm px-4 py-3 rounded-lg">
          No tenés una peluquería asignada. Contactá a tu peluquería.
        </div>
      </div>
    );
  }

  // Fetch services
  const { data: services } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes")
    .eq("shop_id", profile.shop_id)
    .order("name", { ascending: true });

  // Fetch staff members with profiles
  const staffResult = await fetchPublicStaff(profile.shop_id);
  const staffMembers: StaffMemberWithProfile[] = staffResult.success
    ? (staffResult.data ?? []).map((member) => ({
        user_id: member.user_id,
        name: member.name || "Staff",
        photo_url: member.photo_url ?? null,
        description: member.description ?? null,
        instagram: member.instagram ?? null,
        whatsapp: member.whatsapp ?? null,
      }))
    : [];

  // Fetch staff-service assignments
  const memberIds = staffMembers.map((m) => m.user_id);
  const { data: staffServicesRaw } = await supabase
    .from("staff_services")
    .select("staff_id, service_id")
    .in("staff_id", memberIds);
  const staffServicesMap: Record<string, string[]> = {};
  for (const row of staffServicesRaw ?? []) {
    if (!staffServicesMap[row.staff_id]) staffServicesMap[row.staff_id] = [];
    staffServicesMap[row.staff_id].push(row.service_id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reservar Turno</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Elegí el servicio, peluquero, fecha y hora
        </p>
      </div>

      <BookingFlow
        shopId={profile.shop_id}
        services={(services || []).map((s) => ({ ...s, duration_minutes: s.duration_minutes ?? 0 }))}
        staffMembers={staffMembers}
        staffServicesMap={staffServicesMap}
        selectedServiceId={serviceId}
        selectedStaffId={staffId}
      />
    </div>
  );
}
