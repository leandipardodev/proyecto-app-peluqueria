import { fetchClientAppointments } from "@/lib/dashboard/client-actions";
import { cancelClientAppointment } from "@/lib/dashboard/client-actions";
import { revalidatePath } from "next/cache";
import ClientAppointmentsList from "@/components/client/appointments-list";

export const dynamic = "force-dynamic";

interface ClientAppointmentsPageProps {
  searchParams: Promise<{ success?: string }>;
}

export default async function ClientAppointmentsPage({ searchParams }: ClientAppointmentsPageProps) {
  const { success } = await searchParams;

  let appointments: Awaited<
    ReturnType<typeof fetchClientAppointments>
  > = [];
  let error: string | null = null;

  try {
    appointments = await fetchClientAppointments();
  } catch (e) {
    error = e instanceof Error ? e.message : "Error al cargar turnos";
  }

  async function handleCancel(formData: FormData) {
    "use server";
    const id = formData.get("appointment_id") as string;
    await cancelClientAppointment(id);
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
