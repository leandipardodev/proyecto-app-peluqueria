"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppointmentFormModal from "@/components/calendar/appointment-form-modal";
import { Button } from "@/components/ui/button";

const supabase = createClient();

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  customers: { name: string; email: string } | null;
  staff: { name: string } | null;
  services: { name: string; price: number } | null;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
}

interface StaffMember {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("shop_id")
        .eq("user_id", user.id)
        .single();
      
      if (!profile?.shop_id) return;
      const sId = profile.shop_id;
      setShopId(sId);

      const [appointmentsRes, servicesRes, staffRes, customersRes] = await Promise.all([
        supabase
          .from("appointments")
          .select(`
            id,
            start_time,
            end_time,
            status,
            is_paid,
            customers!appointments_customer_id_fkey(name, email),
            staff!appointments_staff_id_fkey(name),
            services!appointments_service_id_fkey(name, price)
          `)
          .eq("shop_id", sId)
          .order("start_time", { ascending: true }),
        supabase.from("services").select("*").eq("shop_id", sId),
        supabase.from("user_profiles").select("user_id, name, email, role").eq("shop_id", sId).in("role", ["owner", "staff"]),
        supabase.from("user_profiles").select("user_id, name, email, phone").eq("shop_id", sId).eq("role", "customer"),
      ]);

      if (!appointmentsRes.error && appointmentsRes.data) {
        setAppointments(appointmentsRes.data as unknown as Appointment[]);
      }
      if (!servicesRes.error && servicesRes.data) {
        setServices(servicesRes.data as Service[]);
      }
      if (!staffRes.error && staffRes.data) {
        setStaff(staffRes.data.map((s: any) => ({ id: s.user_id, role: s.role, name: s.name, email: s.email })));
      }
      if (!customersRes.error && customersRes.data) {
        setCustomers(customersRes.data.map((c: any) => ({ id: c.user_id, name: c.name, email: c.email, phone: c.phone })));
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      in_progress: "bg-purple-100 text-purple-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
      no_show: "bg-gray-100 text-gray-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const formatStatus = (status: string) => {
    return status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const handleSuccess = () => {
    setShowForm(false);
    // Reload appointments
    if (shopId) {
      supabase
        .from("appointments")
        .select(`*`)
        .eq("shop_id", shopId)
        .order("start_time", { ascending: true })
        .then(({ data }) => {
          if (data) setAppointments(data as unknown as Appointment[]);
        });
    }
  };

  if (loading) return <div className="p-6">Cargando...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Turnos</h1>
        <Button onClick={() => setShowForm(true)}>Nuevo Turno</Button>
      </div>

      {showForm && (
        <AppointmentFormModal
          open={showForm}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
          services={services}
          staff={staff}
          customers={customers}
        />
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Horario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Servicio
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Staff
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pago
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {appointments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No hay turnos registrados
                </td>
              </tr>
            ) : (
              appointments.map((apt) => (
                <tr key={apt.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(apt.start_time)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {apt.customers?.name || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {apt.services?.name || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {apt.staff?.name || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(apt.status)}`}>
                      {formatStatus(apt.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {apt.is_paid ? (
                      <span className="text-green-600">Pagado</span>
                    ) : (
                      <span className="text-red-600">Pendiente</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
