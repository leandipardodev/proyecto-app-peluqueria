import { fetchServices } from "@/lib/dashboard/service-actions";
import ServicesList from "@/components/services/services-list";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  let services: any[] = [];

  const result = await fetchServices();
  if (result.success) {
    services = result.data ?? [];
  } else {
    console.error("[ServicesPage] Error al cargar servicios:", result.error);
  }

  return <ServicesList initialServices={services} />;
}
