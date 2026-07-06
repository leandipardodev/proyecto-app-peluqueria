import { fetchClientAppointments } from "@/lib/dashboard/clients/actions";
import { cancelClientAppointment } from "@/lib/dashboard/clients/actions";
import { revalidatePath } from "next/cache";
import ClientAppointmentsList from "@/components/client/appointments-list";

export const dynamic = "force-dynamic";

interface ClientAppointmentsPageProps {
  searchParams: Promise<{ success?: string }>;
}

type ClientAppointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  notes: string | null;
  service: { name: string; price: number; duration_minutes: number } | null;
  staff: { name: string | null } | null;
};

export default async function ClientAppointmentsPage({ searchParams }: ClientAppointmentsPageProps) {
  const { success } = await searchParams;

  let appointments: ClientAppointment[] = [];
  let error: string | null = null;

  const result = await fetchClientAppointments();
  if (result.success) {
    appointments = result.data ?? [];
  } else {
    error = result.error;
  }

  async function handleCancel(formData: FormData) {
    "use server";
    const id = formData.get("appointment_id") as string;
    const result = await cancelClientAppointment(id);
    if (!result.success) {
      console.error("Error al cancelar:", result.error);
    }
    revalidatePath("/client/appointments");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Mis Turnos</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Gestioná tus reservas
        </p>
      </div>

      {success === "appointment_created" && (
        <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm px-4 py-3 rounded-lg">
          ¡Turno reservado con éxito!
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <ClientAppointmentsList
        appointments={appointments}
        onCancel={handleCancel}
      />
    </div>
  );
}
