import { fetchServices } from "@/lib/dashboard/service-actions";
import ServicesList from "@/components/services/services-list";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  let services: Awaited<ReturnType<typeof fetchServices>> = [];

  try {
    services = await fetchServices();
  } catch (e) {
    console.error("[ServicesPage] Error al cargar servicios:", e);
    services = [];
  }

  return <ServicesList initialServices={services} />;
}
