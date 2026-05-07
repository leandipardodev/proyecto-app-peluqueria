import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/dashboard/auth-server";
import BookingFlow from "@/components/client/booking-flow";
import { fetchPublicStaff } from "@/lib/dashboard/client-actions";

interface ClientBookPageProps {
  searchParams: Promise<{ serviceId?: string; staffId?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ClientBookPage({ searchParams }: ClientBookPageProps) {
  const { serviceId, staffId } = await searchParams;
  const session = await getAuthSession();

  const supabase = await createServerClient();

  // Get shop from user's profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .single();

  if (!profile?.shop_id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Reservar Turno</h1>
        <div className="bg-yellow-50 text-yellow-700 text-sm px-4 py-3 rounded-lg">
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

  // Fetch staff members
  const staffMembers = await fetchPublicStaff(profile.shop_id);

  // Find pre-selected service and staff if provided
  const selectedService = serviceId
    ? services?.find(s => s.id === serviceId) || null
    : null;
  const selectedStaffId = staffId || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reservar Turno</h1>
        <p className="mt-1 text-sm text-gray-500">
          Elegí el servicio, peluquero, fecha y hora
        </p>
      </div>

      <BookingFlow
        shopId={profile.shop_id}
        services={services || []}
        staffMembers={staffMembers}
        selectedServiceId={serviceId}
        selectedStaffId={staffId}
      />
    </div>
  );
}
