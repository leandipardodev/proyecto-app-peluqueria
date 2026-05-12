"use client";

import { useState } from "react";
import { MessageCircle, Bell, CreditCard, Copy, Check } from "lucide-react";
import AppointmentFormModal from "@/components/calendar/appointment-form-modal";
import { Button } from "@/components/ui/button";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { createPaymentLink } from "@/lib/payments/mercadopago-actions";

type Appointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null } | null;
  staff: { user_id: string; name: string } | null;
  services: { id: string; name: string; price: number } | null;
};

type Service = { id: string; name: string; duration_minutes: number; price: number };
type StaffMember = { id: string; role: string; name: string | null; email: string | null };
type Customer = { id: string; nombre: string | null; email: string | null; telefono: string | null };

function extractEmoji(name: string): { emoji: string; label: string } {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return { emoji: parts[0], label: parts.slice(1).join(" ") };
  return { emoji: "", label: name };
}

const statusBadge: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-gray-100 text-gray-800",
};

interface Props {
  initialAppointments: Appointment[];
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  shopName: string;
  shopAddress?: string | null;
  whatsappTemplate?: string | null;
  error?: string | null;
}

export default function AppointmentsTable({ initialAppointments, services, staff, customers, shopName, shopAddress, whatsappTemplate, error }: Props) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [showForm, setShowForm] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useAppointmentAlarm(appointments);

  function handleSuccess() {
    setShowForm(false);
  }

  function buildWhatsAppUrl(phone: string | null, customerName: string, startTime: string): string {
    if (!phone) return "#";
    const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
    const time = new Date(startTime).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const template = whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
    const locationLine = shopAddress ? `\n📍 ${shopAddress}` : "";
    const text = template
      .replace(/\{Nombre\}/g, customerName)
      .replace(/\{Peluqueria\}/g, shopName)
      .replace(/\{Hora\}/g, time) + locationLine;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  function isUrgent(startTime: string, status: string): boolean {
    if (status !== "scheduled") return false;
    const diff = new Date(startTime).getTime() - Date.now();
    return diff > 0 && diff <= 3600000;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Turnos</h1>
        <Button onClick={() => setShowForm(true)}>Nuevo Turno</Button>
      </div>

      {showForm && (
        <AppointmentFormModal
          open={showForm}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
          services={services.map(s => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price }))}
          staff={staff}
          customers={customers}
        />
      )}

      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <table className="min-w-full divide-y divide-white/20 dark:divide-white/10">
          <thead className="bg-white/40 dark:bg-black/20">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Horario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Servicio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Staff</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pago</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-transparent dark:bg-transparent divide-y divide-white/20 dark:divide-white/10">
            {appointments.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No hay turnos registrados</td>
              </tr>
            ) : (
              appointments.map((apt) => {
                const svc = apt.services?.name ? extractEmoji(apt.services.name) : null;
                return (
                  <tr key={apt.id} className="hover:bg-white/40 dark:hover:bg-white/5 cursor-pointer">
                    <td suppressHydrationWarning className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {new Date(apt.start_time).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td suppressHydrationWarning className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {new Date(apt.start_time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      {" - "}
                      {new Date(apt.end_time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {apt.customers?.nombre || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {svc ? `${svc.emoji} ${svc.label}` : apt.services?.name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {apt.staff?.name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusBadge[apt.status] || "bg-gray-100 text-gray-800"}`}>
                        {apt.status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {apt.is_paid ? <span className="text-green-600">Pagado</span> : <span className="text-red-600">Pendiente</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const urgent = isUrgent(apt.start_time, apt.status);
                          const phone = apt.customers?.telefono || null;
                          const whatsappUrl = buildWhatsAppUrl(phone, apt.customers?.nombre || "Cliente", apt.start_time);
                          const link = paymentLinks[apt.id];
                          const generating = generatingId === apt.id;
                          return (
                            <>
                              {urgent && (
                                <span title="Próximo turno en menos de 1 hora">
                                  <Bell className="w-4 h-4 text-red-500 animate-pulse shrink-0" />
                                </span>
                              )}
                              <a
                                href={whatsappUrl}
                                target={phone ? "_blank" : undefined}
                                rel={phone ? "noopener noreferrer" : undefined}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-colors ${
                                  phone
                                    ? "bg-green-600 text-white hover:bg-green-700 shadow-sm cursor-pointer select-none"
                                    : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                }`}
                                title={phone ? "Enviar WhatsApp" : "Sin teléfono — editá el cliente para agregarlo"}
                                onClick={!phone ? (e) => e.preventDefault() : undefined}
                              >
                                <MessageCircle className="w-4 h-4" />
                                WhatsApp
                              </a>
                              {apt.is_paid ? (
                                <span className="text-xs text-green-600 font-medium">Pagado</span>
                              ) : link ? (
                                <div className="flex items-center gap-1">
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer select-none"
                                    title="Abrir link de pago"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    Link
                                  </a>
                                  <button
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(link);
                                      setCopiedId(apt.id);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }}
                                    className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer select-none"
                                    title="Copiar link"
                                  >
                                    {copiedId === apt.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                  {phone && (
                                    <a
                                      href={`https://wa.me/${phone.replace(/[^\d]/g, "").replace(/^00/, "")}?text=${encodeURIComponent(`Hola! Te paso el link para pagar tu turno: ${link}`)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-md text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors cursor-pointer select-none"
                                      title="Enviar por WhatsApp"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={async () => {
                                    setGeneratingId(apt.id);
                                    setPaymentLinks((prev) => {
                                      const next = { ...prev };
                                      delete next[apt.id];
                                      return next;
                                    });
                                    const result = await createPaymentLink(apt.id);
                                    if (result.success && result.data?.init_point) {
                                      setPaymentLinks((prev) => ({ ...prev, [apt.id]: result.data!.init_point }));
                                    } else {
                                      alert("Error al generar el link");
                                    }
                                    setGeneratingId(null);
                                  }}
                                  disabled={generating}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer select-none"
                                >
                                  <CreditCard className="w-4 h-4" />
                                  {generating ? "Generando..." : "Cobrar"}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
